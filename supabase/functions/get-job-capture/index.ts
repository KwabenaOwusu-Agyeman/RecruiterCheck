import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const NOT_FOUND_MESSAGE = 'This capture is no longer available. Paste, use a URL, or upload instead.'

interface FetchRequest {
  captureId?: unknown
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

    const { captureId } = (await req.json()) as FetchRequest
    if (typeof captureId !== 'string' || !UUID_RE.test(captureId)) {
      return jsonResponse({ error: NOT_FOUND_MESSAGE }, 400)
    }

    // Single-use, atomic: RLS restricts this to the caller's own rows (a
    // capture can never be fetched by changing the ID to someone else's), the
    // expiry filter fails safe on stale captures, and deleting-on-read means
    // the same capture can't be replayed into a second New Check.
    const { data, error } = await userClient
      .from('job_captures')
      .delete()
      .eq('id', captureId)
      .gt('expires_at', new Date().toISOString())
      .select('job_title, company_name, job_description, job_url')
      .maybeSingle()

    if (error) {
      console.error('get-job-capture: query failed', { message: error.message })
      return jsonResponse({ error: NOT_FOUND_MESSAGE }, 500)
    }

    if (!data) {
      return jsonResponse({ error: NOT_FOUND_MESSAGE }, 404)
    }

    return jsonResponse({
      jobTitle: data.job_title,
      companyName: data.company_name,
      jobDescription: data.job_description,
      jobUrl: data.job_url,
    })
  } catch (error) {
    console.error('get-job-capture error:', error)
    return jsonResponse({ error: NOT_FOUND_MESSAGE }, 500)
  }
})

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
