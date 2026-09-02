import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { Buffer } from 'node:buffer'
import mammoth from 'npm:mammoth@1.8.0'
import { extractText as extractPdfText, getDocumentProxy } from 'npm:unpdf@0.12.1'
import {
  classifyValidationFailure,
  normalizeAnalysis,
  toAuditRecord,
  withRetry,
  type AnalysisResult,
  type RawAnalysis,
} from './logic.ts'
import { buildAnalysisRequestBody } from './prompt.ts'
import { buildBrevoPayload, isTestAccountEmail, resolveSendDecision } from './trustpilot-email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_CV_CHARS = 15000
// Exactly two attempts total: validate the first AI response, retry once if
// it's invalid, and fail the check safely (no saved score, no consumed
// credit — see the catch block around generateFeedback below) if the
// second attempt is also invalid. Never silently falls back to a fabricated
// result.
const MAX_ATTEMPTS = 2
const OPENAI_TIMEOUT_MS = 45000
const PARSE_TIMEOUT_MS = 15000
// Actual enforcement of the free-check limit lives in the
// reserve_check_analysis Postgres function (see migration
// switch_to_weekly_allotment_plans), which atomically checks and reserves a
// slot under a row lock — this constant exists here only to build the
// matching user-facing error message; keep it in sync with the limit
// hardcoded in that function. The weekly period limit varies by plan, so
// its message is built from the profile's own period_checks_limit instead
// of a hardcoded constant.
const FREE_TIER_LIFETIME_LIMIT = 1

const RATE_LIMIT_BUCKET = 'analyze-check'
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_SECONDS = 3600

interface AnalyzeRequest {
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
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')

    if (!openaiApiKey) {
      return jsonResponse({ error: 'Analysis service is not configured' }, 503)
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

    const { checkId } = (await req.json()) as AnalyzeRequest
    if (!checkId) {
      return jsonResponse({ error: 'checkId is required' }, 400)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // Each call parses a CV and makes a paid OpenAI request, so this needs
    // its own rate limit independent of the usage-quota reservation below —
    // a user within their plan's quota could otherwise still hammer this
    // endpoint. Same pattern as generate-documents.
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
      console.error('analyze-check: rate limit check failed', rateLimitError)
      return jsonResponse({ error: 'Could not process this request. Please try again.' }, 500)
    }

    if (!rateLimitAllowed) {
      return jsonResponse({ error: 'Too many analysis requests. Please try again later.' }, 429)
    }

    const { data: check, error: checkError } = await adminClient
      .from('checks')
      .select('*')
      .eq('id', checkId)
      .eq('user_id', user.id)
      .single()

    if (checkError || !check) {
      return jsonResponse({ error: 'Check not found' }, 404)
    }

    if (check.job_description.trim().length < 50) {
      return jsonResponse({ error: 'Job description is too short to analyze' }, 400)
    }

    // Atomically checks the free/paid usage allowance and flips this check to
    // 'processing' in one transaction (row-locked on the user's profile), so
    // two concurrent requests (two tabs, a double submit) can't both read
    // "under limit" before either has committed. See the migration for full
    // reasoning; this must stay a single RPC call, not separate count+update
    // steps, or the atomicity guarantee is lost.
    const { data: reservation, error: reservationError } = await adminClient.rpc(
      'reserve_check_analysis',
      { p_check_id: checkId, p_user_id: user.id },
    )

    if (reservationError) {
      console.error('analyze-check: reserve_check_analysis failed', reservationError)
      return jsonResponse({ error: 'Could not verify usage limit' }, 500)
    }

    const reason = reservation?.[0]?.reason as string | undefined
    if (!reservation?.[0]?.allowed) {
      console.error('analyze-check: usage limit denied', { userId: user.id, checkId, reason })
      if (reason === 'free_tier_limit') {
        return jsonResponse(
          { error: `You have used your ${FREE_TIER_LIFETIME_LIMIT} free Recruiter Check. Upgrade to continue.` },
          429,
        )
      }
      if (reason === 'no_checks_balance') {
        return jsonResponse(
          { error: 'You have no checks left. Buy a check pack to continue.', pricingUrl: '/pricing' },
          429,
        )
      }
      if (reason === 'already_processing' || reason === 'already_completed') {
        return jsonResponse({ error: 'This check is already being processed' }, 409)
      }
      return jsonResponse({ error: 'Could not start this check' }, 400)
    }

    const { data: cvFile, error: downloadError } = await adminClient.storage
      .from('cvs')
      .download(check.cv_storage_path)

    if (downloadError || !cvFile) {
      console.error('analyze-check: CV download failed', { checkId, message: downloadError?.message })
      await markFailed(adminClient, checkId, 'Could not read CV file')
      return jsonResponse({ error: 'Could not read CV file' }, 400)
    }

    let cvText: string
    try {
      cvText = await extractText(cvFile, check.cv_file_name)
    } catch (error) {
      console.error('analyze-check: CV parsing failed', {
        checkId,
        fileName: check.cv_file_name,
        message: error instanceof Error ? error.message : String(error),
      })
      await markFailed(adminClient, checkId, 'Could not read text from this CV file')
      return jsonResponse({ error: 'Could not read text from this CV file' }, 400)
    }

    // The detailed scoring rubric is the only active scoring path — every
    // check, for every user. See logic.ts for the full rubric/evidence
    // validation and check_score_audits for the private audit record.
    const startedAt = Date.now()
    let result: { analysis: AnalysisResult; metrics: GenerateFeedbackMetrics }
    try {
      result = await generateFeedback(openaiApiKey, cvText, check.job_description, {
        jobTitle: check.job_title,
        companyName: check.company_name,
      })
    } catch (error) {
      // Both attempts produced invalid/unusable output (or the model call
      // itself failed twice) — fail the check honestly rather than saving a
      // fabricated result. No feedback row is written,
      // complete_check_analysis_with_audit is never called, so no score is
      // stored and no credit or free check is consumed: reserve_check_analysis
      // only flips status to 'processing', it never decrements
      // checks_balance/lifetime_checks_consumed, so there is nothing to roll
      // back — the credit was never spent in the first place. markFailed
      // clears status to 'failed', which also lifts the "already_processing"
      // guard so the user's own Retry immediately works instead of waiting
      // out the 10 minute staleness window.
      //
      // The raw error message is classified into a fixed, non-sensitive
      // reason code for monitoring (see classifyValidationFailure) and then
      // discarded — never logged verbatim, since validation failure messages
      // can echo model-generated text (e.g. new_claims_introduced content)
      // back in the thrown error, and that must never reach our own logs.
      const message = error instanceof Error ? error.message : String(error)
      logMonitoringEvent({
        outcome: 'failed',
        firstAttemptSuccess: false,
        retryUsed: true,
        retryExhausted: true,
        reasonCode: classifyValidationFailure(message),
        totalDurationMs: Date.now() - startedAt,
        firstAttemptDurationMs: null,
        retryDurationMs: null,
        model: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
      })
      console.error('analyze-check: both attempts invalid, failing safely', { checkId })
      await markFailed(adminClient, checkId, 'Could not complete this analysis. Please try again.')
      return jsonResponse({ error: 'Could not complete this analysis. Please try again.' }, 502)
    }

    const analysis = result.analysis
    const metrics = result.metrics

    const { error: feedbackError } = await adminClient.from('feedback').upsert(
      {
        check_id: checkId,
        strengths: analysis.strengths,
        improvements: analysis.improvements,
        prospects: analysis.prospects,
      },
      { onConflict: 'check_id' },
    )

    if (feedbackError) {
      await markFailed(adminClient, checkId, 'Could not save feedback')
      return jsonResponse({ error: 'Could not save feedback' }, 500)
    }

    // Marks the check completed, records usage, and inserts the private
    // scoring audit row in one atomic step. complete_check_analysis_with_audit
    // wraps the existing, unmodified complete_check_analysis (same
    // signature, same grants, same callers as before this feature existed)
    // and adds the audit insert inside the same implicit transaction — see
    // migration add_check_score_audits. Usage itself is a durable counter
    // on profiles, never derived from counting `checks` rows, so deleting a
    // completed check afterward can never restore this slot.
    const auditRecord = toAuditRecord(analysis.score_breakdown, analysis.evidence_references)
    const { error: completeError } = await adminClient.rpc('complete_check_analysis_with_audit', {
      p_check_id: checkId,
      p_user_id: user.id,
      p_score: analysis.interview_probability_score,
      p_detected_language: analysis.detected_language,
      p_job_title: analysis.job_title,
      p_company_name: analysis.company_name,
      p_experience_score: analysis.experience_score,
      p_skills_score: analysis.skills_score,
      p_uvp_score: analysis.uvp_score,
      p_rubric_version: auditRecord.rubric_version,
      p_prompt_version: auditRecord.prompt_version,
      p_model_identifier: auditRecord.model_identifier,
      p_scoring_method: auditRecord.scoring_method,
      p_subcriteria: auditRecord.subcriteria,
      p_category_totals: auditRecord.category_totals,
      p_evidence_references: auditRecord.evidence_references,
      p_calculated_at: auditRecord.calculated_at,
    })

    if (completeError) {
      console.error('analyze-check: complete_check_analysis_with_audit failed', {
        checkId,
        message: completeError.message,
      })
      // complete_check_analysis is one plpgsql call: if it raised partway
      // through, Postgres rolls back everything it did (status, score
      // columns, credit consumption, ledger insert) as a unit — so no credit
      // was consumed here either. The check's row is still 'processing'
      // (feedback was saved above, but the check itself was never marked
      // completed), which would otherwise sit there until the 10 minute
      // staleness window in reserve_check_analysis lets a retry through.
      // Marking it failed now makes that immediate instead of a silent wait.
      await markFailed(adminClient, checkId, 'Could not save analysis result')
      return jsonResponse({ error: 'Could not save analysis result' }, 500)
    }

    logMonitoringEvent({
      outcome: 'success',
      firstAttemptSuccess: metrics.firstAttemptSuccess,
      retryUsed: metrics.retryUsed,
      retryExhausted: false,
      reasonCode: null,
      totalDurationMs: metrics.totalDurationMs,
      firstAttemptDurationMs: metrics.firstAttemptDurationMs,
      retryDurationMs: metrics.retryDurationMs,
      model: metrics.model,
      promptTokens: metrics.usage?.promptTokens ?? null,
      completionTokens: metrics.usage?.completionTokens ?? null,
      totalTokens: metrics.usage?.totalTokens ?? null,
    })

    // Best effort and non-blocking: a failure here must never turn a
    // successfully completed check into an error response for the user.
    await sendResultsReadyEmail(adminClient, {
      checkId,
      userEmail: user.email ?? null,
      recipientName: (user.user_metadata?.full_name as string | undefined) ?? null,
      // Mirror complete_check_analysis's own coalesce(job_title, p_job_title)
      // precedence so the email shows the same title as the stored row. The
      // company is deliberately not passed: employer names are never shown,
      // in-product or in email.
      jobTitle: check.job_title || analysis.job_title || null,
      score: analysis.interview_probability_score,
    })

    return jsonResponse({ success: true, checkId })
  } catch (error) {
    console.error('analyze-check error:', error)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})

/**
 * Sends the "Your Recruiter Check is ready" transactional email via Brevo,
 * BCC'ing Trustpilot's Automatic Feedback Service address so Trustpilot
 * sends its own separate review invitation after its configured delay.
 *
 * Only called after complete_check_analysis has already succeeded (a real,
 * completed check). Who actually receives a send, and whether the
 * Trustpilot BCC is included, is decided by resolveSendDecision from
 * TRUSTPILOT_EMAIL_TEST_MODE and whether this is a designated test account
 * (see that function's doc comment for the full test-mode/production
 * matrix). Duplicate prevention is a separate, unconditional guard: an
 * atomic UPDATE ... WHERE trustpilot_notified_at IS NULL — this is the only
 * place that column is written, so it also serves as the once-per-check-id
 * lock even across concurrent/retried requests for the same check.
 *
 * Never logs the recipient's email address or any secret value (API key,
 * Trustpilot BCC address) — only the check id and non-sensitive outcome
 * fields (reason, whether a BCC was included, HTTP status, Brevo message id).
 */
async function sendResultsReadyEmail(
  client: ReturnType<typeof createClient>,
  params: {
    checkId: string
    userEmail: string | null
    recipientName: string | null
    jobTitle: string | null
    score: number
  },
) {
  try {
    if (!params.userEmail) {
      console.warn('analyze-check: skipping results email, user has no email', { checkId: params.checkId })
      return
    }

    const brevoApiKey = Deno.env.get('BREVO_API_KEY')
    if (!brevoApiKey) {
      console.warn('analyze-check: BREVO_API_KEY not set, skipping results email', { checkId: params.checkId })
      return
    }

    const testMode = Deno.env.get('TRUSTPILOT_EMAIL_TEST_MODE') === 'true'
    const isTestAccount = isTestAccountEmail(params.userEmail, Deno.env.get('TEST_ACCOUNT_EMAILS'))
    const decision = resolveSendDecision(testMode, isTestAccount)

    if (!decision.shouldSend) {
      console.log('analyze-check: results email not sent', { checkId: params.checkId, reason: decision.reason })
      return
    }

    // Atomic claim: only the request that actually flips this row from null
    // wins the right to send. Any retry, duplicate webhook, or concurrent
    // request for the same check will affect zero rows here and return early.
    const { data: claimed, error: claimError } = await client
      .from('checks')
      .update({ trustpilot_notified_at: new Date().toISOString() })
      .eq('id', params.checkId)
      .is('trustpilot_notified_at', null)
      .select('id')

    if (claimError) {
      console.error('analyze-check: trustpilot_notified_at claim failed', {
        checkId: params.checkId,
        message: claimError.message,
      })
      return
    }

    if (!claimed || claimed.length === 0) {
      console.log('analyze-check: results email already sent for this check, skipping', {
        checkId: params.checkId,
      })
      return
    }

    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://myrecruitercheck.com'
    const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL') ?? 'notifications@myrecruitercheck.com'
    const senderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'MyRecruiterCheck'
    // Only read the Trustpilot address into memory at all when it's actually
    // going to be used — never fetched (and so never loggable) in test mode.
    const trustpilotAfsEmail = decision.includeBcc ? Deno.env.get('TRUSTPILOT_AFS_EMAIL') : undefined

    const payload = buildBrevoPayload(
      {
        toEmail: params.userEmail,
        recipientName: params.recipientName,
        jobTitle: params.jobTitle,
        score: params.score,
        resultsUrl: `${siteUrl}/checks/${params.checkId}`,
      },
      senderEmail,
      senderName,
      trustpilotAfsEmail,
      Deno.env.get('BREVO_REPLY_TO_EMAIL'),
    )

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      console.error('analyze-check: results email failed', {
        checkId: params.checkId,
        status: response.status,
      })
      return
    }

    const responseBody = (await response.json().catch(() => null)) as { messageId?: string } | null
    console.log('analyze-check: results email sent', {
      checkId: params.checkId,
      testMode,
      hasBcc: Boolean(payload.bcc),
      status: response.status,
      messageId: responseBody?.messageId,
    })
  } catch (error) {
    console.error('analyze-check: results email error', {
      checkId: params.checkId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

async function markFailed(
  client: ReturnType<typeof createClient>,
  checkId: string,
  message: string,
) {
  await client
    .from('checks')
    .update({ status: 'failed', error_message: message })
    .eq('id', checkId)
}

/**
 * Checks the downloaded blob's actual leading bytes against the type
 * extractText is about to dispatch on — defense in depth on top of the
 * bucket's own allowed_mime_types restriction, in case a row was ever
 * uploaded with a mismatched declared type. text/plain has no reliable
 * signature, so it's skipped.
 */
function hasValidMagicBytes(bytes: Uint8Array, isPdf: boolean, isDocx: boolean): boolean {
  if (isPdf) {
    return (
      bytes.length >= 5 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46 &&
      bytes[4] === 0x2d
    )
  }
  if (isDocx) {
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
  }
  return true
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ])
}

async function extractText(file: Blob, fileName: string): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)

  // Dispatch on the downloaded blob's own Content-Type (set by Supabase
  // Storage from the mimetype it recorded at upload, which the "cvs" bucket
  // already restricts via allowed_mime_types) rather than the client-supplied
  // file name — a direct API call could otherwise set cv_file_name to
  // anything to steer this to the wrong parser. Only fall back to the file
  // name suffix if the blob genuinely has no type (older rows uploaded
  // before content type was always set).
  const mimeType = file.type
  const lowerName = fileName.toLowerCase()
  const isPdf = mimeType === 'application/pdf' || (!mimeType && lowerName.endsWith('.pdf'))
  const isDocx =
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    (!mimeType && lowerName.endsWith('.docx'))
  const isTxt = mimeType === 'text/plain' || (!mimeType && lowerName.endsWith('.txt'))

  if (!hasValidMagicBytes(bytes, isPdf, isDocx)) {
    throw new Error('File content does not match its declared type')
  }

  let text: string

  if (isPdf) {
    const pdf = await withTimeout(getDocumentProxy(bytes), PARSE_TIMEOUT_MS, 'PDF parsing')
    const result = await withTimeout(extractPdfText(pdf, { mergePages: true }), PARSE_TIMEOUT_MS, 'PDF text extraction')
    text = Array.isArray(result.text) ? result.text.join('\n') : result.text
  } else if (isDocx) {
    const result = await withTimeout(
      mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) }),
      PARSE_TIMEOUT_MS,
      'DOCX parsing',
    )
    text = result.value
  } else if (isTxt) {
    // Pasted-CV path: the client saves pasted text as a plain-text file.
    text = new TextDecoder('utf-8').decode(arrayBuffer)
  } else {
    throw new Error('Unsupported file type')
  }

  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length < 50) {
    throw new Error('Extracted text is too short')
  }

  return cleaned.slice(0, MAX_CV_CHARS)
}

// Aggregate, non-sensitive token usage as returned by OpenAI's own response
// — never derived from, or containing, any prompt/CV/job-description text.
export interface TokenUsage {
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
}

export interface GenerateFeedbackMetrics {
  attempts: number
  firstAttemptSuccess: boolean
  retryUsed: boolean
  totalDurationMs: number
  firstAttemptDurationMs: number | null
  retryDurationMs: number | null
  model: string | null
  usage: TokenUsage | null
}

/**
 * Structured JSON output, schema-validated. Validates the first AI response;
 * if it's invalid (fails schema/grounding/consistency checks inside
 * normalizeAnalysis) or the call itself fails, retries exactly once more.
 * If the second attempt is also invalid, throws rather than returning
 * anything — there is no fallback result. The caller (below) treats that
 * throw as a hard failure: mark the check 'failed', save no feedback,
 * complete no score, consume no credit. withRetry lives in logic.ts so the
 * retry mechanism itself is unit-testable without a Deno runtime.
 *
 * Also returns aggregate, privacy safe timing/model/token metrics for
 * monitoring (see logMonitoringEvent) — populated on success only; the
 * caller's catch block builds its own metrics for the failure case, since
 * this function throws (not returns) when every attempt fails.
 */
async function generateFeedback(
  apiKey: string,
  cvText: string,
  jobDescription: string,
  context: { jobTitle: string | null; companyName: string | null },
): Promise<{ analysis: AnalysisResult; metrics: GenerateFeedbackMetrics }> {
  const startedAt = Date.now()
  let attempts = 0
  let firstAttemptDurationMs: number | null = null
  let retryDurationMs: number | null = null
  let lastModel: string | null = null
  let lastUsage: TokenUsage | null = null

  const analysis = await withRetry(async (previousError) => {
    attempts += 1
    const attemptStartedAt = Date.now()
    const { raw, model, usage } = await callOpenAI(apiKey, cvText, jobDescription, context, previousError)
    lastModel = model
    lastUsage = usage
    const result = normalizeAnalysis(raw, cvText, { model })
    const attemptDurationMs = Date.now() - attemptStartedAt
    if (attempts === 1) firstAttemptDurationMs = attemptDurationMs
    else retryDurationMs = attemptDurationMs
    return result
  }, MAX_ATTEMPTS)

  return {
    analysis,
    metrics: {
      attempts,
      firstAttemptSuccess: attempts === 1,
      retryUsed: attempts > 1,
      totalDurationMs: Date.now() - startedAt,
      firstAttemptDurationMs,
      retryDurationMs,
      model: lastModel,
      usage: lastUsage,
    },
  }
}

async function callOpenAI(
  apiKey: string,
  cvText: string,
  jobDescription: string,
  context: { jobTitle: string | null; companyName: string | null },
  // Set only on a retry: the previous attempt's validation failure message
  // (from normalizeAnalysis, or "Empty response"/a parse error from this
  // function itself), appended as a correction instruction below. This is
  // never logged by our own code — see the catch block in the main handler
  // — it only ever travels back to the same model that already produced
  // whatever text it might reference, so nothing new is exposed by sending
  // it back in the request.
  correctionNote: string | null = null,
): Promise<{ raw: RawAnalysis; model: string | null; usage: TokenUsage | null }> {
  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    // The prompt, schema, model and temperature all live in prompt.ts and
    // are shared verbatim with scripts/live-sample-wording.ts.
    body: JSON.stringify(buildAnalysisRequestBody(cvText, jobDescription, context, correctionNote)),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenAI API error: ${response.status} ${body}`)
  }

  const payload = (await response.json()) as {
    model?: string
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  }
  const rawText = payload.choices?.[0]?.message?.content

  if (!rawText) {
    throw new Error('Empty response from analysis service')
  }

  // Aggregate token counts only — never the prompt or completion text
  // itself. Absent entirely from providers/responses that don't return it.
  const usage: TokenUsage | null = payload.usage
    ? {
        promptTokens: payload.usage.prompt_tokens ?? null,
        completionTokens: payload.usage.completion_tokens ?? null,
        totalTokens: payload.usage.total_tokens ?? null,
      }
    : null

  // The response's own `model` field is the resolved model snapshot (e.g.
  // "gpt-4o-mini-2024-07-18"), not just the alias requested — this is what
  // gets stamped into the score breakdown as the model identifier, when
  // OpenAI's response actually includes it.
  return { raw: JSON.parse(rawText) as RawAnalysis, model: payload.model ?? null, usage }
}

// ---------------------------------------------------------------------------
// Privacy safe aggregate monitoring
//
// A single structured line per check, to this function's own private log
// stream (Supabase's dashboard/API, never a public or user facing surface).
// Every field here is either a boolean, a count, a duration in
// milliseconds, a token count, a model identifier string (e.g.
// "gpt-4o-mini-2024-07-18"), or one of the fixed ValidationFailureReasonCode
// strings from logic.ts — never CV text, job description text,
// evidence_basis text, a name, an email address, a phone number, a raw
// prompt, or a raw AI response. See classifyValidationFailure in logic.ts
// for how a thrown error message becomes one of these fixed reason codes
// rather than being logged verbatim.
// ---------------------------------------------------------------------------

interface MonitoringEvent {
  outcome: 'success' | 'failed'
  firstAttemptSuccess: boolean | null
  retryUsed: boolean | null
  retryExhausted: boolean
  reasonCode: string | null
  totalDurationMs: number
  firstAttemptDurationMs: number | null
  retryDurationMs: number | null
  model: string | null
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
}

function logMonitoringEvent(event: MonitoringEvent) {
  console.log('analyze-check-monitoring', JSON.stringify(event))
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * A hung OpenAI request would otherwise be caught only by the platform's own
 * hard timeout, at an unpredictable point that may not leave time for
 * markFailed to run. Aborting deterministically at OPENAI_TIMEOUT_MS lets
 * this fail into the normal retry/markFailed path instead.
 */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS)

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`OpenAI request timed out after ${OPENAI_TIMEOUT_MS}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
