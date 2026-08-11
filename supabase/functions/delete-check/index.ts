import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://recruitercheck.vercel.app',
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

    // Nothing retained per the GDPR delete cascade: CV, generated documents,
    // feedback (via FK cascade), then the check row itself.
    if (check.cv_storage_path) {
      await adminClient.storage.from('cvs').remove([check.cv_storage_path])
    }

    const documentsPrefix = `${user.id}/${checkId}`
    const { data: documentFiles } = await adminClient.storage
      .from('documents')
      .list(documentsPrefix)

    if (documentFiles && documentFiles.length > 0) {
      await adminClient.storage
        .from('documents')
        .remove(documentFiles.map((file) => `${documentsPrefix}/${file.name}`))
    }

    const { error: deleteError } = await adminClient
      .from('checks')
      .delete()
      .eq('id', checkId)
      .eq('user_id', user.id)

    if (deleteError) {
      return jsonResponse({ error: 'Could not delete check' }, 500)
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
