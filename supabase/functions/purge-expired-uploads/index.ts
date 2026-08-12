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
      .select('id, cv_storage_path, upload_purge_attempts')
      .eq('uploads_purged', false)
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
      const success = await purgeOne(adminClient, check.id, check.cv_storage_path)

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

/**
 * Removes the CV file from storage (if one exists) and blanks the original
 * upload fields on the check row, leaving job_title/company_name/status/
 * scores and the linked feedback row untouched. Returns false (and leaves
 * uploads_purged unset, so the next run retries) if the storage removal
 * itself fails; the DB update failing after a successful storage removal
 * still counts as a failure so it retries too, since a retry just re-runs
 * an idempotent storage delete on an already-gone object.
 */
async function purgeOne(
  adminClient: ReturnType<typeof createClient>,
  checkId: string,
  cvStoragePath: string | null,
): Promise<boolean> {
  if (cvStoragePath) {
    const { error: removeError } = await adminClient.storage.from('cvs').remove([cvStoragePath])
    if (removeError) {
      console.error('purge-expired-uploads: storage removal failed', {
        checkId,
        message: removeError.message,
      })
      return false
    }
  }

  const { error: updateError } = await adminClient
    .from('checks')
    .update({
      cv_storage_path: '',
      cv_file_name: '',
      job_description: '',
      uploads_purged: true,
      uploads_purged_at: new Date().toISOString(),
    })
    .eq('id', checkId)

  if (updateError) {
    console.error('purge-expired-uploads: row update failed', { checkId, message: updateError.message })
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
