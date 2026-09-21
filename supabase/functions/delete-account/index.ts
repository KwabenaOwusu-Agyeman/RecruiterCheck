import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { removeFolder, type StorageBucketApi } from '../_shared/storage-cleanup.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const bucket = (name: string) => adminClient.storage.from(name) as unknown as StorageBucketApi

    // Files first, and the whole of the user's folder in both buckets rather
    // than the paths on their rows: replaced CV versions and files no row
    // points at are removed too. A failure stops here, before the account is
    // touched, so trying again can finish the job.
    const cvError = await removeFolder(bucket('cvs'), user.id)
    const documentsError = cvError ? null : await removeFolder(bucket('documents'), user.id)
    if (cvError || documentsError) {
      console.error('delete-account: storage removal failed', { userId: user.id })
      return jsonResponse({ error: 'Could not delete your files. Please try again in a moment.' }, 500)
    }

    // Deleting the auth user cascades to profiles, and from there to checks,
    // feedback, credits, the ledger and every other row that belongs to the
    // user. There is no subscription to cancel: packs are one-time payments
    // and the subscriptions table was dropped in 20260825084801.
    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(user.id)
    if (deleteUserError) {
      console.error('delete-account: auth user delete failed', { userId: user.id, message: deleteUserError.message })
      return jsonResponse(
        {
          error:
            'Your files were deleted, but we could not finish deleting your account. Please try again, or email support@myrecruitercheck.com and we will complete it.',
        },
        500,
      )
    }

    return jsonResponse({ success: true })
  } catch (error) {
    console.error('delete-account error:', error instanceof Error ? error.message : String(error))
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
