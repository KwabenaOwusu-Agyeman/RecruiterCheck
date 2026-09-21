import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { listCheckCvPaths, removeFolder, removePaths, type StorageBucketApi } from '../_shared/storage-cleanup.ts'
import { isOwnStoragePath } from '../_shared/storage-path.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DeleteRequest {
  checkId: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const { checkId } = (await req.json()) as DeleteRequest
    if (!checkId) {
      return jsonResponse({ error: 'checkId is required' }, 400)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: check, error: checkError } = await adminClient
      .from('checks')
      .select('id, user_id, cv_storage_path')
      .eq('id', checkId)
      .eq('user_id', user.id)
      .single()

    if (checkError || !check) {
      return jsonResponse({ error: 'Check not found' }, 404)
    }

    const bucket = (name: string) => adminClient.storage.from(name) as unknown as StorageBucketApi

    // Files first, so a failure leaves the row in place and trying again can
    // find them. Every CV version stored for this check is removed, not only
    // the path on the row (pasted CVs autosave a new object on each pause),
    // and nothing outside the caller's own folder is ever touched.
    const cvs = bucket('cvs')
    const { paths: cvPaths, error: cvListError } = await listCheckCvPaths(cvs, user.id, checkId)
    if (isOwnStoragePath(check.cv_storage_path, user.id) && !cvPaths.includes(check.cv_storage_path)) {
      cvPaths.push(check.cv_storage_path)
    }
    const cvError = cvListError ?? (await removePaths(cvs, cvPaths))
    const documentsError = cvError ? null : await removeFolder(bucket('documents'), `${user.id}/${checkId}`)
    if (cvError || documentsError) {
      console.error('delete-check: storage removal failed', { checkId })
      return jsonResponse({ error: 'Could not delete this check. Please try again in a moment.' }, 500)
    }

    // Feedback, sentiment and the score audit go with the row (ON DELETE
    // CASCADE); ledger entries keep their amount and lose the link.
    const { error: deleteError } = await adminClient
      .from('checks')
      .delete()
      .eq('id', checkId)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('delete-check: row delete failed', { checkId, code: deleteError.code })
      return jsonResponse({ error: 'Could not delete this check. Please try again in a moment.' }, 500)
    }

    return jsonResponse({ success: true })
  } catch (error) {
    console.error('delete-check error:', error)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
