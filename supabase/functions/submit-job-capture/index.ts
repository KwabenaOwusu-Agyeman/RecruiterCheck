import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_TITLE_CHARS = 300
const MAX_COMPANY_CHARS = 300
const MAX_DESCRIPTION_CHARS = 15000
const MIN_DESCRIPTION_CHARS = 100
const MAX_URL_CHARS = 2000
const MAX_DOMAIN_CHARS = 100
const ALLOWED_SOURCE_DOMAINS = new Set(['linkedin', 'indeed', 'other'])

interface CaptureRequest {
  jobTitle?: unknown
  companyName?: unknown
  jobDescription?: unknown
  jobUrl?: unknown
  sourceDomain?: unknown
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

    const body = (await req.json()) as CaptureRequest

    const jobDescription = sanitizeText(body.jobDescription, MAX_DESCRIPTION_CHARS)
    if (!jobDescription || jobDescription.length < MIN_DESCRIPTION_CHARS) {
      return jsonResponse({ error: 'Job description is too short to capture.' }, 400)
    }

    const jobTitle = sanitizeText(body.jobTitle, MAX_TITLE_CHARS)
    const companyName = sanitizeText(body.companyName, MAX_COMPANY_CHARS)
    const jobUrl = sanitizeUrl(body.jobUrl)
    const sourceDomain = sanitizeSourceDomain(body.sourceDomain)

    // user_id is intentionally never taken from the request body — it comes
    // only from the authenticated session, and the table's own RLS `with
    // check` re-enforces this regardless.
    const { data, error } = await userClient
      .from('job_captures')
      .insert({
        job_title: jobTitle,
        company_name: companyName,
        job_description: jobDescription,
        job_url: jobUrl,
        source_domain: sourceDomain,
      })
      .select('id')
      .single()

    if (error) {
      console.error('submit-job-capture: insert failed', { message: error.message })
      return jsonResponse({ error: "We couldn't send this job to RecruiterCheck. Try again." }, 500)
    }

    return jsonResponse({ captureId: data.id })
  } catch (error) {
    console.error('submit-job-capture error:', error)
    return jsonResponse({ error: "We couldn't send this job to RecruiterCheck. Try again." }, 500)
  }
})

function sanitizeText(value: unknown, maxChars: number): string | null {
  if (typeof value !== 'string') return null
  // Extraction reads DOM textContent, so this is defense in depth, not the
  // primary sanitization layer — still worth stripping any stray markup and
  // control characters before storage.
  const cleaned = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return null
  return cleaned.slice(0, maxChars)
}

function sanitizeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_URL_CHARS) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString().slice(0, MAX_URL_CHARS)
  } catch {
    return null
  }
}

function sanitizeSourceDomain(value: unknown): string {
  if (typeof value !== 'string') return 'other'
  const normalized = value.toLowerCase().slice(0, MAX_DOMAIN_CHARS)
  return ALLOWED_SOURCE_DOMAINS.has(normalized) ? normalized : 'other'
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
