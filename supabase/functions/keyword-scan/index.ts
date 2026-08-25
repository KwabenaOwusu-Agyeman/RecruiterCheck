import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { Buffer } from 'node:buffer'
import mammoth from 'npm:mammoth@1.8.0'
import { extractText as extractPdfText, getDocumentProxy } from 'npm:unpdf@0.12.1'

// Standalone free "keyword scan" feature (Bizzy deck's "LIMITED — a few free
// tasks" habit-building step). Deliberately has NO shared code path with
// analyze-check/generate-documents: it does keyword/skill overlap only, no
// interview score, no strengths/improvements/prospects, no recruiter
// judgment. Nothing from this function is ever persisted — no table write
// of any kind, the CV and job description are held only in memory for the
// single request and then discarded.

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_CV_CHARS = 15000
const MAX_JOB_DESCRIPTION_CHARS = 15000
const PARSE_TIMEOUT_MS = 15000
const OPENAI_TIMEOUT_MS = 20000
const FREE_SCAN_LIMIT = 3

const RATE_LIMIT_BUCKET = 'keyword-scan'
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_SECONDS = 3600

interface ScanRequest {
  cvBase64: string
  cvFileName: string
  cvMimeType?: string
  jobDescription: string
}

interface ScanResult {
  matchPercent: number
  matched: string[]
  missing: string[]
  matchedTotal: number
  missingTotal: number
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
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')

    if (!openaiApiKey) {
      return jsonResponse({ error: 'Scan service is not configured' }, 503)
    }

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

    const body = (await req.json()) as ScanRequest
    if (!body.cvBase64 || !body.cvFileName || !body.jobDescription) {
      return jsonResponse({ error: 'cvBase64, cvFileName, and jobDescription are required' }, 400)
    }
    if (body.jobDescription.trim().length < 50) {
      return jsonResponse({ error: 'Job description is too short to scan' }, 400)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: rateLimitAllowed, error: rateLimitError } = await adminClient.rpc(
      'check_and_record_rate_limit',
      {
        p_user_id: user.id,
        p_bucket: RATE_LIMIT_BUCKET,
        p_limit: RATE_LIMIT_MAX,
        p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
      },
    )

    if (rateLimitError) {
      console.error('keyword-scan: rate limit check failed', rateLimitError)
      return jsonResponse({ error: 'Could not process this request. Please try again.' }, 500)
    }
    if (!rateLimitAllowed) {
      return jsonResponse({ error: 'Too many scan requests. Please try again later.' }, 429)
    }

    // Free-scan cap only applies while the user has never purchased a check
    // pack — once they have any purchase history, the scan is unlimited
    // (near-zero cost to run, and a genuine decision aid before spending a
    // paid check, so gating it after someone's already paying serves no
    // purpose). See migration 20260825120000_check_pack_system.sql.
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('keyword_scans_consumed')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return jsonResponse({ error: 'Profile not found' }, 404)
    }

    const { count: purchaseCount } = await adminClient
      .from('credit_batches')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source', 'purchase')

    const hasPurchased = (purchaseCount ?? 0) > 0

    if (!hasPurchased && profile.keyword_scans_consumed >= FREE_SCAN_LIMIT) {
      return jsonResponse(
        { error: `You have used all ${FREE_SCAN_LIMIT} free scans. Buy a check pack to keep scanning.` },
        429,
      )
    }

    let cvText: string
    try {
      cvText = await extractText(
        Buffer.from(body.cvBase64, 'base64'),
        body.cvFileName,
        body.cvMimeType,
      )
    } catch (error) {
      console.error('keyword-scan: CV parsing failed', {
        fileName: body.cvFileName,
        message: error instanceof Error ? error.message : String(error),
      })
      return jsonResponse({ error: 'Could not read text from this CV file' }, 400)
    }

    const jobDescription = body.jobDescription.trim().slice(0, MAX_JOB_DESCRIPTION_CHARS)

    let result: ScanResult
    try {
      result = await callOpenAI(openaiApiKey, cvText, jobDescription)
    } catch (error) {
      console.error('keyword-scan: OpenAI call failed', error)
      return jsonResponse({ error: 'Could not complete the scan. Please try again.' }, 502)
    }

    if (!hasPurchased) {
      await adminClient
        .from('profiles')
        .update({ keyword_scans_consumed: profile.keyword_scans_consumed + 1 })
        .eq('id', user.id)
    }

    return jsonResponse(result)
  } catch (error) {
    console.error('keyword-scan error:', error)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ])
}

/**
 * Duplicated (not shared) from analyze-check's own extractText, per this
 * codebase's existing convention of duplicating small helpers across
 * independently-deployable edge functions. Takes raw bytes directly rather
 * than downloading from Storage, since a keyword scan never uploads or
 * persists the CV anywhere.
 */
async function extractText(bytes: Buffer, fileName: string, mimeType?: string): Promise<string> {
  const lowerName = fileName.toLowerCase()
  const isPdf = mimeType === 'application/pdf' || (!mimeType && lowerName.endsWith('.pdf'))
  const isDocx =
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    (!mimeType && lowerName.endsWith('.docx'))
  const isTxt = mimeType === 'text/plain' || (!mimeType && lowerName.endsWith('.txt'))

  let text: string

  if (isPdf) {
    const pdf = await withTimeout(getDocumentProxy(new Uint8Array(bytes)), PARSE_TIMEOUT_MS, 'PDF parsing')
    const result = await withTimeout(extractPdfText(pdf, { mergePages: true }), PARSE_TIMEOUT_MS, 'PDF text extraction')
    text = Array.isArray(result.text) ? result.text.join('\n') : result.text
  } else if (isDocx) {
    const result = await withTimeout(mammoth.extractRawText({ buffer: bytes }), PARSE_TIMEOUT_MS, 'DOCX parsing')
    text = result.value
  } else if (isTxt) {
    text = bytes.toString('utf-8')
  } else {
    throw new Error('Unsupported file type')
  }

  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length < 50) {
    throw new Error('Extracted text is too short')
  }

  return cleaned.slice(0, MAX_CV_CHARS)
}

/**
 * One cheap GPT-4o-mini call for semantic keyword/skill matching — not
 * naive string matching, which would call "Machine Learning" a miss against
 * a job post that says "ML." Extraction and comparison happen in the same
 * call: the model reads both texts and reasons about which of the job's
 * important terms are genuinely present in the CV, synonyms and phrasing
 * variants included. Returns only the top 3 of each side plus true totals —
 * the frontend shows "+N more" rather than the full lists, since this is
 * deliberately a teaser, not the full picture.
 */
async function callOpenAI(apiKey: string, cvText: string, jobDescription: string): Promise<ScanResult> {
  const systemPrompt = `You compare a CV against a job description for keyword and skill overlap only. Do not judge seniority, quality, or overall fit — that is a separate, paid product. Extract the important skills, tools, and named requirements from the job description, then classify each as "matched" (the CV shows clear evidence of it, even if phrased differently — e.g. "ML" and "Machine Learning" are the same, "5+ years" and "five years experience" are the same) or "missing" (no reasonable evidence of it in the CV). Return every term you identify, most important first.`

  const userPrompt = `JOB DESCRIPTION:\n${jobDescription}\n\nCV:\n${cvText}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'keyword_scan',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                matched: { type: 'array', items: { type: 'string' } },
                missing: { type: 'array', items: { type: 'string' } },
              },
              required: ['matched', 'missing'],
              additionalProperties: false,
            },
          },
        },
      }),
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('OpenAI returned no content')
  }

  const parsed = JSON.parse(content) as { matched: string[]; missing: string[] }
  const matchedTotal = parsed.matched.length
  const missingTotal = parsed.missing.length
  const total = matchedTotal + missingTotal

  return {
    matchPercent: total > 0 ? Math.round((matchedTotal / total) * 100) : 0,
    matched: parsed.matched.slice(0, 3),
    missing: parsed.missing.slice(0, 3),
    matchedTotal,
    missingTotal,
  }
}
