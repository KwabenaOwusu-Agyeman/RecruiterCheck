import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

// Invoked exclusively by the purge-expired-uploads pg_cron job (see
// migration upload_auto_purge) over HTTP via pg_net, authorized with the
// project's service-role key (stored in Supabase Vault, never in this
// repo). There is no end user on this request — the gateway's verify_jwt
// only proves the bearer token is *some* valid Supabase-signed JWT (an anon
// key or a logged-in user's own access token would also pass it), so this
// function additionally checks the token's own `role` claim is
// `service_role` before doing anything. Without that check, any
// authenticated user could trigger early deletion of other users'
// still-in-progress uploads.
//
// Checking the decoded role claim rather than comparing the raw token
// against Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') byte-for-byte is
// deliberate: this project's Vault-stored service-role key is a validly
// signed, non-expired JWT for this project (verified by the gateway's own
// verify_jwt before the request ever reaches this code) but does not
// byte-match the runtime's injected env var, likely due to this project's
// key rotation/format history — the role claim is the actual security
// property that matters here, and checking it is robust to that.
//
// Never log CV content, job-description text, or file names here — only
// check IDs, timestamps, and success/failure, matching upload_purge_log.
//
// Also purges generated documents (tailored CV / cover letter / recruiter
// email / zip, written by generate-documents to the `documents` bucket at
// `${user_id}/${checkId}/...`) on the same 24h window as the original
// upload — see migration purge_generated_documents.

const BATCH_SIZE = 200
const RETENTION_HOURS = 24
const MAX_PURGE_ATTEMPTS = 10

function isServiceRoleRequest(req: Request): boolean {
  const authHeader = req.headers.get('Authorization') ?? ''
  const match = authHeader.match(/^Bearer (.+)$/)
  if (!match) return false

  const token = match[1]
  const parts = token.split('.')
  if (parts.length !== 3) return false

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded))
    return payload?.role === 'service_role'
  } catch {
    return false
  }
}

Deno.serve(async (req) => {
  try {
    if (!isServiceRoleRequest(req)) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000).toISOString()

    const { data: expired, error: selectError } = await adminClient
      .from('checks')
      .select('id, user_id, cv_storage_path, uploads_purged, documents_purged, upload_purge_attempts')
      .or('uploads_purged.eq.false,documents_purged.eq.false')
      .lt('created_at', cutoff)
      .lt('upload_purge_attempts', MAX_PURGE_ATTEMPTS)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE)

    if (selectError) {
      console.error('purge-expired-uploads: select failed', { message: selectError.message })
      return jsonResponse({ error: 'Could not query expired uploads' }, 500)
    }

    let purged = 0
    let failed = 0

    for (const check of expired ?? []) {
      const attemptNumber = check.upload_purge_attempts + 1
      const success = await purgeOne(adminClient, check)

      await adminClient.from('upload_purge_log').insert({
        check_id: check.id,
        success,
        attempt_number: attemptNumber,
      })

      if (success) {
        purged += 1
      } else {
        failed += 1
        await adminClient
          .from('checks')
          .update({ upload_purge_attempts: attemptNumber })
          .eq('id', check.id)
      }
    }

    return jsonResponse({ success: true, purged, failed, scanned: expired?.length ?? 0 })
  } catch (error) {
    console.error('purge-expired-uploads error:', error instanceof Error ? error.message : String(error))
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})

interface ExpiredCheck {
  id: string
  user_id: string
  cv_storage_path: string | null
  uploads_purged: boolean
  documents_purged: boolean
}

/**
 * Purges the two independent things a check can still be holding past
 * retention: the original CV upload (`cvs` bucket + the row's upload
 * fields) and any generated documents (`documents` bucket, deterministic
 * `${user_id}/${checkId}/...` path, no path column to look up). Each leg is
 * skipped if already marked purged, and only the still-outstanding leg(s)
 * get their purged flag/timestamp set — if one leg fails, the other's
 * progress is still persisted rather than being re-attempted needlessly.
 * Overall success (and whether upload_purge_attempts increments) requires
 * both legs to be done; a retry safely re-runs an idempotent storage delete
 * on an already-gone object.
 */
async function purgeOne(adminClient: ReturnType<typeof createClient>, check: ExpiredCheck): Promise<boolean> {
  let uploadsOk = check.uploads_purged
  if (!uploadsOk) {
    uploadsOk = await purgeUpload(adminClient, check.id, check.cv_storage_path)
  }

  let documentsOk = check.documents_purged
  if (!documentsOk) {
    documentsOk = await purgeDocuments(adminClient, check.id, check.user_id)
  }

  const update: Record<string, unknown> = {}
  if (uploadsOk && !check.uploads_purged) {
    update.cv_storage_path = ''
    update.cv_file_name = ''
    update.job_description = ''
    update.uploads_purged = true
    update.uploads_purged_at = new Date().toISOString()
  }
  if (documentsOk && !check.documents_purged) {
    update.documents_purged = true
    update.documents_purged_at = new Date().toISOString()
  }

  if (Object.keys(update).length > 0) {
    const { error: updateError } = await adminClient.from('checks').update(update).eq('id', check.id)
    if (updateError) {
      console.error('purge-expired-uploads: row update failed', {
        checkId: check.id,
        message: updateError.message,
      })
      // The storage-side deletes above may have already succeeded even
      // though this write failed — reporting failure here just means the
      // next run retries; those deletes are idempotent on an already-gone
      // object, so retrying is harmless.
      return false
    }
  }

  return uploadsOk && documentsOk
}

async function purgeUpload(
  adminClient: ReturnType<typeof createClient>,
  checkId: string,
  cvStoragePath: string | null,
): Promise<boolean> {
  if (!cvStoragePath) return true

  const { error } = await adminClient.storage.from('cvs').remove([cvStoragePath])
  if (error) {
    console.error('purge-expired-uploads: cv storage removal failed', { checkId, message: error.message })
    return false
  }
  return true
}

async function purgeDocuments(
  adminClient: ReturnType<typeof createClient>,
  checkId: string,
  userId: string,
): Promise<boolean> {
  const prefix = `${userId}/${checkId}`

  const { data: files, error: listError } = await adminClient.storage.from('documents').list(prefix)
  if (listError) {
    console.error('purge-expired-uploads: documents list failed', { checkId, message: listError.message })
    return false
  }

  if (!files || files.length === 0) return true

  const { error: removeError } = await adminClient.storage
    .from('documents')
    .remove(files.map((file) => `${prefix}/${file.name}`))

  if (removeError) {
    console.error('purge-expired-uploads: documents removal failed', { checkId, message: removeError.message })
    return false
  }

  return true
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
