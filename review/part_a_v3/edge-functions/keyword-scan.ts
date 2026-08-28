import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { Buffer } from 'node:buffer'
import mammoth from 'npm:mammoth@1.8.0'
import {
  extractText as extractPdfText,
  getDocumentProxy,
} from 'npm:unpdf@0.12.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const MAX_BODY_BYTES = 15_000_000
const MAX_BASE64_LEN = 14_000_000
const MAX_DECODED_BYTES = 10 * 1024 * 1024
const MAX_CV_CHARS = 15000
const MAX_JOB_DESCRIPTION_CHARS = 15000
const MIN_JOB_DESCRIPTION_CHARS = 50
const PARSE_TIMEOUT_MS = 15000
const OPENAI_TIMEOUT_MS = 20000
const ACCEPTED_CV_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const ACCEPTED_CV_EXT = ['.pdf', '.docx']
const ACCEPTED_JOB_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
])
const ACCEPTED_JOB_EXT = ['.pdf', '.docx', '.txt']

const RATE_LIMIT_BUCKET = 'keyword-scan'
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_SECONDS = 3600

interface ScanRequest {
  idempotencyKey: string
  cvBase64?: string
  cvFileName?: string
  cvMimeType?: string
  cvPastedText?: string
  jobDescription?: string
  jobDescriptionBase64?: string
  jobDescriptionFileName?: string
  jobDescriptionMimeType?: string
  jobDescriptionUrl?: string
}

interface ScanResult {
  match_percent: number
  matched_total: number
  missing_total: number
  matched_terms: string[]
  missing_terms: string[]
}

// Explicit row shapes for the RPC calls below, matching each function's own
// RETURNS TABLE(...) in 01_production_migration.sql exactly. The Supabase
// client's default (untyped) Database generic makes .rpc() return an
// under-specified `{}`-like type, so these are asserted rather than
// inferred -- narrower and more honest than casting to `any`.
interface ReserveRow {
  outcome: string
  reservation_id: string
  cached_result: Record<string, unknown> | null
}
interface CompleteRow {
  outcome: string
  cached_result: Record<string, unknown> | null
  result_expires_at: string | null
}
interface ReleaseRow {
  outcome: string
}

// Exported so keyword-scan-canary.ts can share this exact implementation
// rather than duplicating business logic. userClient/adminClient/user are
// passed in already-constructed/verified by the caller (either this file's
// own Deno.serve below, using the caller's own JWT, or the canary
// wrapper, after its own allowlist check has already passed).
export async function handleKeywordScanRequest(
  req: Request,
  ctx: {
    userClient: SupabaseClient
    adminClient: SupabaseClient
    user: { id: string }
  },
): Promise<Response> {
  const { userClient, adminClient, user } = ctx
  try {
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      return jsonResponse({ error: 'Scan service is not configured' }, 503)
    }

    const contentLength = req.headers.get('content-length')
    if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'Request too large' }, 413)
    }

    let rawBody: string
    try {
      rawBody = await readBodyBounded(req, MAX_BODY_BYTES)
    } catch {
      return jsonResponse({ error: 'Request too large' }, 413)
    }
    const body = JSON.parse(rawBody) as ScanRequest

    if (
      !body.idempotencyKey || body.idempotencyKey.length < 8 ||
      body.idempotencyKey.length > 100
    ) {
      return jsonResponse({ error: 'Missing or invalid idempotency key' }, 400)
    }

    if (body.cvBase64 && body.cvBase64.length > MAX_BASE64_LEN) {
      return jsonResponse({ error: 'CV file is too large' }, 413)
    }
    if (
      body.jobDescriptionBase64 &&
      body.jobDescriptionBase64.length > MAX_BASE64_LEN
    ) {
      return jsonResponse({ error: 'Job description file is too large' }, 413)
    }

    const hasCv = Boolean(body.cvBase64) || Boolean(body.cvPastedText?.trim())
    const hasJob = Boolean(body.jobDescription?.trim()) ||
      Boolean(body.jobDescriptionUrl?.trim()) ||
      Boolean(body.jobDescriptionBase64)

    if (!hasCv || !hasJob) {
      return jsonResponse({
        error: 'A CV and a job description are both required',
      }, 400)
    }

    // ---- CV extraction ------------------------------------------------------
    let cvText: string
    try {
      if (body.cvBase64 && body.cvFileName) {
        validateFile(
          body.cvFileName,
          body.cvMimeType,
          ACCEPTED_CV_MIME,
          ACCEPTED_CV_EXT,
        )
        cvText = await extractText(
          decodeBounded(body.cvBase64, MAX_DECODED_BYTES),
          body.cvFileName,
          body.cvMimeType,
          MAX_CV_CHARS,
        )
      } else {
        cvText = (body.cvPastedText ?? '').trim()
        if (cvText.length < 50) {
          return jsonResponse({ error: 'Pasted CV text is too short' }, 400)
        }
        cvText = cvText.slice(0, MAX_CV_CHARS)
      }
    } catch (error) {
      console.error('keyword-scan: CV parsing failed', {
        fileName: body.cvFileName,
        message: error instanceof Error ? error.message : String(error),
      })
      return jsonResponse(
        { error: 'Could not read text from this CV file' },
        400,
      )
    }

    // ---- Job description extraction: paste, upload, or URL -----------------
    let jobDescriptionText: string
    try {
      if (body.jobDescriptionBase64 && body.jobDescriptionFileName) {
        validateFile(
          body.jobDescriptionFileName,
          body.jobDescriptionMimeType,
          ACCEPTED_JOB_MIME,
          ACCEPTED_JOB_EXT,
        )
        const extractResp = await adminClient.functions.invoke(
          'extract-job-file',
          {
            body: {
              fileBase64: body.jobDescriptionBase64,
              fileName: body.jobDescriptionFileName,
              mimeType: body.jobDescriptionMimeType,
            },
          },
        )
        if (extractResp.error || !extractResp.data?.text) {
          return jsonResponse({
            error: 'Could not read text from this job description file',
          }, 400)
        }
        jobDescriptionText = extractResp.data.text
      } else if (body.jobDescriptionUrl) {
        const extractResp = await adminClient.functions.invoke(
          'extract-job-url',
          {
            body: { url: body.jobDescriptionUrl },
          },
        )
        if (extractResp.error || !extractResp.data?.jobDescription) {
          return jsonResponse({
            error:
              "We couldn't read this job posting. Paste the job description instead.",
          }, 422)
        }
        jobDescriptionText = extractResp.data.jobDescription
      } else {
        jobDescriptionText = (body.jobDescription ?? '').trim()
      }
      if (jobDescriptionText.length < MIN_JOB_DESCRIPTION_CHARS) {
        return jsonResponse(
          { error: 'Job description is too short to scan' },
          400,
        )
      }
      jobDescriptionText = jobDescriptionText.slice(
        0,
        MAX_JOB_DESCRIPTION_CHARS,
      )
    } catch (error) {
      console.error('keyword-scan: job description extraction failed', error)
      return jsonResponse({
        error:
          "We couldn't read this job posting. Paste the job description instead.",
      }, 422)
    }

    // ---- Reserve (maintenance check happens INSIDE this RPC) --------------
    const { data: reserveRows, error: reserveError } = await userClient.rpc(
      'reserve_keyword_scan',
      {
        p_idempotency_key: body.idempotencyKey,
      },
    )
    if (reserveError) {
      console.error('keyword-scan: reserve_keyword_scan failed', reserveError)
      return jsonResponse({
        error: 'Could not process this request. Please try again.',
      }, 500)
    }
    const reservation = (reserveRows as ReserveRow[] | null)?.[0]

    switch (reservation?.outcome) {
      case 'replay_result':
        if (!reservation.cached_result) {
          console.error(
            'keyword-scan: replay_result outcome with null cached_result',
          )
          return jsonResponse({
            error: 'Could not process this request. Please try again.',
          }, 500)
        }
        return jsonResponse(reservation.cached_result)
      case 'result_expired':
        return jsonResponse({
          error: 'expired',
          message:
            'Your previous scan completed, but its temporary result has expired. Start a new Keyword Scan to see the result again.',
        }, 410)
      case 'already_processing':
        return jsonResponse({
          error:
            'A scan with this request is already in progress. Please wait.',
        }, 409)
      case 'released':
        return jsonResponse({
          error: 'expired',
          message: 'This scan attempt has ended. Start a new Keyword Scan.',
        }, 410)
      case 'no_credits':
        return jsonResponse(
          { error: 'You have used all your Keyword Scans.' },
          429,
        )
      case 'service_unavailable':
        return jsonResponse({
          error: 'unavailable',
          message:
            'Keyword Scan is temporarily unavailable. Please try again shortly.',
        }, 503)
      case 'reserved':
        break
      default:
        console.error('keyword-scan: unexpected reserve outcome', reservation)
        return jsonResponse({
          error: 'Could not process this request. Please try again.',
        }, 500)
    }

    const { data: newScanAllowed } = await adminClient.rpc(
      'check_and_record_rate_limit',
      {
        p_user_id: user.id,
        p_bucket: RATE_LIMIT_BUCKET,
        p_limit: RATE_LIMIT_MAX,
        p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
      },
    )
    if (!newScanAllowed) {
      await userClient.rpc('release_keyword_scan_reservation', {
        p_reservation_id: reservation.reservation_id,
      })
      return jsonResponse({
        error: 'Too many scan requests. Please try again later.',
      }, 429)
    }

    let result: ScanResult
    try {
      result = await callOpenAI(openaiApiKey, cvText, jobDescriptionText)
    } catch (error) {
      console.error('keyword-scan: OpenAI call failed', error)
      const { data: releaseRows, error: releaseError } = await userClient.rpc(
        'release_keyword_scan_reservation',
        {
          p_reservation_id: reservation.reservation_id,
        },
      )
      if (releaseError) {
        console.error(
          'keyword-scan: release_keyword_scan_reservation failed after OpenAI error',
          {
            reservationId: reservation.reservation_id,
            category: 'release_failed_after_model_error',
          },
        )
        // Not silently ignored -- logged with a non-PII category. The
        // reservation stays 'reserved' until its fixed lease expires;
        // reconcile_abandoned_keyword_scan_reservations restores the
        // credit at that point regardless of this release call's outcome.
      } else {
        console.log(
          'keyword-scan: released after model failure',
          (releaseRows as ReleaseRow[] | null)?.[0]?.outcome,
        )
      }
      return jsonResponse({
        error: 'Could not complete the scan. Please try again.',
      }, 502)
    }

    const { data: completeRows, error: completeError } = await userClient.rpc(
      'complete_keyword_scan',
      {
        p_reservation_id: reservation.reservation_id,
        p_result: result,
      },
    )
    if (completeError) {
      console.error(
        'keyword-scan: complete_keyword_scan RPC call itself failed',
        completeError,
      )
      return jsonResponse({
        error: 'Could not save the scan result. Please try again.',
      }, 500)
    }

    const completion = (completeRows as CompleteRow[] | null)?.[0]
    if (completion?.outcome === 'invalid_result') {
      console.error(
        'keyword-scan: model returned an invalid result, credit released atomically',
      )
      return jsonResponse({
        error: 'Could not complete the scan. Please try again.',
      }, 502)
    }

    if (!completion?.cached_result) {
      console.error(
        'keyword-scan: complete_keyword_scan succeeded but returned no cached_result',
      )
      return jsonResponse({
        error: 'Could not complete the scan. Please try again.',
      }, 500)
    }
    return jsonResponse(completion.cached_result)
  } catch (error) {
    console.error('keyword-scan error:', error)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
}

// Public "keyword-scan" slug's own entry point: builds userClient/adminClient
// from the caller's own JWT (no allowlist gate -- this IS the fully public
// implementation once cutover flips maintenance off) and delegates to the
// shared implementation above.
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
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    return await handleKeywordScanRequest(req, {
      userClient,
      adminClient,
      user,
    })
  } catch (error) {
    console.error('keyword-scan (public slug) error:', error)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
        timeoutMs,
      )
    ),
  ])
}

async function readBodyBounded(
  req: Request,
  maxBytes: number,
): Promise<string> {
  const reader = req.body?.getReader()
  if (!reader) return await req.text()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error('Request body exceeded size limit')
    }
    chunks.push(value)
  }
  const buffer = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    buffer.set(c, offset)
    offset += c.byteLength
  }
  return new TextDecoder('utf-8').decode(buffer)
}

function decodeBounded(base64: string, maxBytes: number): Buffer {
  const bytes = Buffer.from(base64, 'base64')
  if (bytes.byteLength > maxBytes) {
    throw new Error(`Decoded file exceeds ${maxBytes} bytes`)
  }
  return bytes
}

function validateFile(
  fileName: string,
  mimeType: string | undefined,
  acceptedMime: Set<string>,
  acceptedExt: string[],
) {
  const lower = fileName.toLowerCase()
  const extOk = acceptedExt.some((ext) => lower.endsWith(ext))
  const mimeOk = !mimeType || acceptedMime.has(mimeType)
  if (!extOk || !mimeOk) throw new Error('Unsupported file type')
}

async function extractText(
  bytes: Buffer,
  fileName: string,
  mimeType: string | undefined,
  maxChars: number,
): Promise<string> {
  const lowerName = fileName.toLowerCase()
  const isPdf = mimeType === 'application/pdf' ||
    (!mimeType && lowerName.endsWith('.pdf'))
  const isDocx = mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    (!mimeType && lowerName.endsWith('.docx'))

  let text: string
  if (isPdf) {
    const pdf = await withTimeout(
      getDocumentProxy(new Uint8Array(bytes)),
      PARSE_TIMEOUT_MS,
      'PDF parsing',
    )
    const result = await withTimeout(
      extractPdfText(pdf, { mergePages: true }),
      PARSE_TIMEOUT_MS,
      'PDF text extraction',
    )
    text = Array.isArray(result.text) ? result.text.join('\n') : result.text
  } else if (isDocx) {
    const result = await withTimeout(
      mammoth.extractRawText({ buffer: bytes }),
      PARSE_TIMEOUT_MS,
      'DOCX parsing',
    )
    text = result.value
  } else {
    throw new Error('Unsupported file type')
  }

  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length < 50) throw new Error('Extracted text is too short')
  return cleaned.slice(0, maxChars)
}

async function callOpenAI(
  apiKey: string,
  cvText: string,
  jobDescription: string,
): Promise<ScanResult> {
  const systemPrompt =
    `You compare a CV against a job description for keyword and skill overlap only. Do not judge seniority, quality, or overall fit -- that is a separate, paid product. Extract the important skills, tools, and named requirements from the job description, then classify each as "matched" (the CV shows clear evidence of it, even if phrased differently) or "missing" (no reasonable evidence of it in the CV). Return every term you identify, most important first. Never return duplicate terms.`

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
                matched: {
                  type: 'array',
                  maxItems: 20,
                  items: { type: 'string', maxLength: 80 },
                },
                missing: {
                  type: 'array',
                  maxItems: 20,
                  items: { type: 'string', maxLength: 80 },
                },
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
    throw new Error(
      `OpenAI request failed: ${response.status} ${await response.text()}`,
    )
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenAI returned no content')

  const parsed = JSON.parse(content) as { matched: string[]; missing: string[] }
  const matchedTotal = parsed.matched.length
  const missingTotal = parsed.missing.length
  const total = matchedTotal + missingTotal

  return {
    match_percent: total > 0 ? Math.round((matchedTotal / total) * 100) : 0,
    matched_terms: parsed.matched.slice(0, 3),
    missing_terms: parsed.missing.slice(0, 3),
    matched_total: matchedTotal,
    missing_total: missingTotal,
  }
}
