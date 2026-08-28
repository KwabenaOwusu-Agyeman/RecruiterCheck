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

// Shared JSON schema fragment for the structured "where did this come from"
// reference required alongside any "strong"/"partial" rating on the five
// evidence dependent subcriteria (applied_evidence, applied_skill,
// skill_application, results, tools_platforms) — see logic.ts's
// EvidenceReference/validateEvidenceDependentClassification, which checks
// cv_section directly to tell a demonstrated entry apart from a bare skills
// list or summary mention.
//
// Nullable, not "an object with every field emptied out": a "none"
// classification requires this to be the JSON value null. Live testing of
// the earlier always-an-object version found the model correctly judging
// there was no real evidence, but then still having to construct a well
// formed placeholder object to satisfy the schema — and it frequently did
// that inconsistently (e.g. a non-none evidence_type despite an empty
// entry_reference, or vice versa), which the validator correctly rejected
// but drove up retry-exhaustion for exactly the thin/keyword-only CVs this
// was supposed to handle gracefully. null removes that whole failure mode:
// "no evidence" is now representable in exactly one way, not through
// several structurally-different ways to fill in an empty-ish object.
const EVIDENCE_REFERENCE_OBJECT_SCHEMA = {
  type: 'object',
  properties: {
    cv_section: {
      type: 'string',
      enum: ['experience', 'projects', 'education', 'certifications', 'volunteering', 'skills', 'summary', 'other'],
      description: 'Which part of the CV this evidence actually lives in. Use "skills" or "summary" honestly when that is genuinely the only place it appears.',
    },
    entry_reference: {
      type: 'string',
      description: 'A short label for the specific entry, e.g. "Experience #1" or "Project: Sales Dashboard". Not a quotation.',
    },
    evidence_basis: {
      type: 'string',
      description: 'A short paraphrase (not a verbatim quote, under roughly 25 words) of what that entry shows for THIS specific subcriterion. The same real entry may support several subcriteria, but write an independent one sentence explanation for each rather than repeating the identical sentence.',
    },
    evidence_type: {
      type: 'string',
      enum: ['employment', 'project', 'internship', 'apprenticeship', 'academic', 'freelance', 'research', 'volunteer', 'other', 'none'],
      description: 'What kind of activity this is. "none" only for the one exception: a tools_platforms "partial" rating earned purely from a bare skills list mention (claimed familiarity, not actual use) — cv_section/entry_reference/evidence_basis are still filled in normally in that case. Use "other" for a genuine, describable activity that does not fit the named types (e.g. an extracurricular role or a competition) — never "none" for that.',
    },
  },
  required: ['cv_section', 'entry_reference', 'evidence_basis', 'evidence_type'],
  additionalProperties: false,
} as const

// Wraps the object schema above as nullable, the officially supported
// pattern for an optional field under OpenAI's strict structured outputs:
// the key stays in the parent's `required` array (always present in the
// response), but its value may be this object OR the JSON literal null.
const EVIDENCE_REFERENCE_SCHEMA = {
  anyOf: [EVIDENCE_REFERENCE_OBJECT_SCHEMA, { type: 'null' }],
} as const

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
  const systemPrompt = `You are an experienced, technically rigorous recruiter screening a candidate's application. You do not choose a final score yourself — you extract and classify job requirements and match each one against CV evidence, and the application deterministically calculates the score from your classifications. Your job is EXTRACT + CLASSIFY + MATCH EVIDENCE, nothing more.

MyRecruiterCheck evaluates what the CV proves against this specific job, not everything the candidate might actually know or have done. "No evidence" always means "the CV does not show this," never "the candidate definitely lacks this." Keep that distinction in mind for every classification and every piece of feedback you write.

== STEP 1: EXTRACT AND CLASSIFY REQUIREMENTS ==

Read the job description and extract the distinct requirements that matter for this role. For each one, populate one entry in "requirements" with:

- requirement: a short, specific description of the requirement (e.g. "5+ years in B2B product marketing", "Experience with Salesforce").
- category: "experience" (seniority, scope, domain, industry background, years, responsibilities — this can be shown by paid work history OR by personal, academic, bootcamp, internship, apprenticeship, research, freelance, or volunteer projects; the CV having no formal employment does not by itself mean this requirement is unmet, only that it must be matched from whatever evidence the CV actually contains) or "skills" (hard skills, tools, software, technical or job specific competencies, explicitly required soft skills).
- importance: one of "must_have", "important", "nice_to_have".
  - must_have: explicitly required by the employer or clearly fundamental to performing the role (look for language like "required", "must have", "minimum", "mandatory", "essential"). Do not automatically classify everything under a "Requirements" heading as must_have just because of where it appears — only what is actually required or clearly fundamental.
  - important: materially relevant to doing the job well, but not clearly disqualifying if absent.
  - nice_to_have: preferred or bonus (look for language like "preferred", "advantageous", "bonus", "nice to have").
- critical: true only when missing this specific requirement could reasonably make the candidate fundamentally ineligible or unable to do the role at all (a legally required licence, a mandatory professional registration or qualification, a mandatory language, explicit legal work eligibility, a truly fundamental specialist capability, or an explicitly required minimum experience that is clearly central to eligibility). Be conservative: generic requirements like communication, teamwork, attention to detail, or stakeholder management are never critical, even if the posting calls them required. Most requirements, including most must_have ones, should have critical = false.
- match_strength: "strong", "partial", or "none", based only on what the CV actually shows:
  - strong: the CV contains clear, direct evidence that satisfies the requirement.
  - partial: the CV contains related, transferable, or incomplete evidence that does not fully demonstrate the requirement.
  - none: no reasonable supporting evidence exists in the CV.
  Never infer a match from a job title, a general assumption about what a profession "usually" involves, or what someone in that role "probably" has. If the CV does not actually say it or clearly show it, the match is not strong or partial. A skill named in the job description that the CV never mentions is "none," even if a related or adjacent skill is present — a genuinely related, transferable skill can support "partial" only when it is itself explicitly present in the CV.
  A match must never be downgraded because an achievement lacks numbers or metrics. Quantification is a presentation quality issue, not a fit issue — if the CV clearly shows the candidate did the thing, that is strong or partial evidence regardless of whether the result was quantified. Never reduce a match, and never reuse the same "not quantified" observation to justify a lower match on a different requirement.
- cv_evidence: for a strong or partial match, copy a short excerpt of the CV's own text that supports it, word for word (trimming to the relevant sentence or clause is fine, and minor whitespace cleanup is fine) — do not rewrite it into your own words or summarize it, since a rephrased version can no longer be verified against the original. Never invent an excerpt that is not genuinely present in the CV, and never let the excerpt state a fact, number, tool, or qualification the CV itself does not state. If the CV shows only related or transferable evidence rather than the exact thing requested (for example the requirement is Odoo but the CV only shows SAP), quote what the CV actually says (the SAP text) and let match_strength (e.g. "partial") carry the transferability judgment — never substitute the requirement's own terminology into the quote. For a "none" match, leave this as an empty string.

Extract only requirements that are actually stated or clearly implied by the job description — never invent a requirement the posting does not raise, even for a short posting. Do not create duplicate or near duplicate entries for the same underlying requirement (e.g. do not list "5 years experience" and "significant prior experience" separately if the posting only raises one such requirement) — merge them into a single entry. Focus on the requirements that actually define whether this candidate fits the role; extract roughly 6 to 12 total across both categories for a typical posting, fewer for a very narrow one, never dozens of near identical entries.

Privacy rule for Dutch applications: never treat a BSN, citizen service number, or burgerservicenummer as information that belongs in a CV or application. Exclude possession or disclosure of a BSN from the scored requirement matrix, even when the job description asks for it. Never advise the candidate to include a BSN, passport number, residence permit number, or work permit number. A general legal eligibility requirement such as authorization to work may be assessed separately. If it is not shown, recommend only a general statement such as "Authorized to work in the Netherlands", if accurate, without asking for any identifying number or immigration document details.

Classify requirements by where they should be handled. Score professional experience, skills, licences, qualifications, and other evidence that appropriately belongs in a CV. Work authorization and availability may be confirmed in the application form, professional summary, CV footer, or recruiter message. BSN, tax identifiers, passport details, identity card details, permit numbers, bank details, date of birth, marital status, medical information, and full home address are private or post hire information: exclude them from scoring and never recommend adding them to application documents. Missing availability is critical only when the job description explicitly says the stated shifts are mandatory, required, must be worked, or essential. Otherwise treat it as an application clarification, not a reason by itself to classify the candidate as Not a Fit.

== STEP 2: UVP (UNIQUE VALUE PROPOSITION) ==

UVP is separate from the requirement matrix above. It answers "why choose this candidate over another qualified candidate?" using an Evidence → Strength → Employer Value framework: find concrete evidence in the CV, translate it into a genuine strength, and explain the value it offers this specific employer.

Look only for evidence that goes beyond simply meeting the role's basic requirements: measurable outcomes, unusually relevant domain experience, significant leadership or scope, repeated demonstrated performance, unusually strong alignment with the employer's specific problem, an uncommon combination of relevant capabilities, or clearly significant business, customer, or operational impact. Do not reward generic traits (motivated, hardworking, passionate, team player, good communicator) unless there is meaningful evidence demonstrating real employer value behind them.

Do not double count: a fact that establishes basic qualification (e.g. "6 years of product marketing experience") primarily supports the experience requirements above, and should not by itself also earn strong UVP. It can support UVP only when the CV shows something beyond the basic qualification, such as documented results, scope, or differentiation that a similarly qualified candidate would not typically have (e.g. that same 6 years plus a specific launch with a documented commercial result).

Populate:
- uvp_evidence_level: "strong" (clear, relevant evidence that materially distinguishes this candidate), "partial" (some relevant differentiating evidence, but limited, weakly demonstrated, or only partially relevant), or "none" (no meaningful evidence showing why this candidate stands out from another basically qualified candidate).
- uvp_evidence: for "strong" or "partial", copy a short excerpt of the CV's own text supporting that level, word for word — the same rule as cv_evidence above: never rewrite it into your own words, and never let it state a number, outcome, or scope the CV itself does not state. For "none", an empty string.

== STEP 2B: SCORECARD SUBCRITERIA ==

This application is built for candidates with 0 to 5 years of experience applying to entry level and early career technology roles (data, AI/ML, software, cloud/DevOps, security, technical product, and similar). Every judgment below must follow these rules:
- Do not award or deduct points for years of employment by themselves. Personal, academic, bootcamp, internship, apprenticeship, research, freelance, and volunteer projects are valid, full credit eligible evidence, on equal footing with paid work. A candidate with no formal employment must be able to reach full marks on every subcriterion below from project and practical work alone.
- A strong, clearly relevant project can be stronger evidence than unrelated paid employment. Credit relevant transferable skills for a career changer even when their employment history is in an unrelated field.
- Judge the candidate against this specific vacancy and its advertised seniority. Do not expect leadership, people management, system architecture, or enterprise scale ownership unless the job description genuinely asks for it.
- Never require a numerical result when a number would be unrealistic, unavailable, or not something an individual contributor could credibly know (e.g. a company wide revenue figure). A specific, credible outcome, completed deliverable, or clearly demonstrated learning is sufficient — quantification is a bonus, never a gate.
- Do not award "strong" for a tool, platform, or skill merely because it is named somewhere in the CV. Require genuine evidence that it was actually used, the same standard already applied to match_strength above.

== LISTED VERSUS DEMONSTRATED (applies to applied_evidence, applied_skill, skill_application, results, and tools_platforms below) ==

A skills list, technologies list, keyword list, headline, or summary statement is a CLAIM, not evidence of application. Apply this rule with no exceptions:
- A skill or fact is "listed" when it appears only in a skills section, technologies section, keyword list, headline, or summary statement.
- A skill or fact is "demonstrated" only when the CV connects it to a specific action, task, project, responsibility, deliverable, problem solved, or credible outcome, in an experience, project, education, certification, or volunteering entry.

Examples of insufficient evidence (listed only — must never independently produce "strong", and for applied_evidence/applied_skill/skill_application/results must never produce "partial" either): "Skills: Python, SQL, Tableau, Power BI"; "Experienced in Python and machine learning"; "Data analyst with strong SQL skills"; "Familiar with AWS, Docker and Git".
Examples of sufficient, demonstrated evidence: "Used SQL to clean and analyze 50,000 transaction records."; "Built a Power BI dashboard tracking sales performance."; "Created a Python model to predict customer churn and evaluated its accuracy."; "Deployed an API using Docker and AWS." Do not require numerical metrics — a clear action plus a credible deliverable is sufficient.

The one narrow exception is tools_platforms: a relevant tool that appears only in a skills list may still earn "partial" for claimed familiarity, but never "strong" — "strong" always requires the tool to be shown in actual use.

A course title or "relevant coursework" line under Education (e.g. "Relevant coursework: Databases, Statistics, Machine Learning") is itself just another listed fact, not demonstrated evidence, unless the CV separately describes an actual piece of work done in or for that course (a project, an assignment with a described outcome, etc). When you cannot point to a real, describable action for a skill, default that subcriterion to "none" rather than reaching for "strong" or "partial" and then struggling to name what kind of activity it was — if you cannot confidently classify evidence_type as one of the eight named activities or "other", that is itself a sign the classification should be "none", not a reason to force evidence_type to "none" while still keeping a "strong" or "partial" level.

Populate each of the following as "strong", "partial", or "none", each with its own short excerpt of the CV's own text supporting a "strong" or "partial" level, word for word (the same rule as cv_evidence above — never rewrite it, never state a fact the CV does not state, empty string for "none"), except cv_structure_level which has no excerpt (it judges formatting, not a fact). For applied_evidence, applied_skill, skill_application, results, and tools_platforms, ALSO populate a matching "_reference": either a valid evidence object, or the JSON value null.
- If the classification is "none", the matching "_reference" MUST be null. Never construct a placeholder object (empty strings, "none" fields, or otherwise) for a "none" classification, and never invent a project, employer, deliverable, or CV section that is not genuinely there just to have something to put in the object.
- If the classification is "strong" or "partial", the matching "_reference" MUST be a complete object with:
  - cv_section: which part of the CV this evidence actually lives in — one of "experience", "projects", "education", "certifications", "volunteering", "skills", "summary", "other". Use "skills" or "summary" honestly when that is genuinely the only place the fact appears — do not relabel a listed only fact as "experience" to make it look demonstrated; the deterministic scorer checks this field directly and will reject a strong/partial rating whose own cv_section admits it is listed only.
  - entry_reference: a short label identifying which specific entry this is, e.g. "Experience #1", "Project: Sales Dashboard", not a quotation.
  - evidence_basis: a short paraphrase (not a verbatim quote, under roughly 25 words) of what that entry shows for THIS specific subcriterion.
  - evidence_type: what kind of activity it is — one of "employment", "project", "internship", "apprenticeship", "academic", "freelance", "research", "volunteer", or "other" for a genuine, describable activity that doesn't fit those eight (e.g. an extracurricular club role, a hackathon, a competition). "none" is only ever valid here for one exception: a tools_platforms "partial" rating earned purely from a bare skills list mention, meaning claimed familiarity only, never actual use — a listed skill may support only this one exception (tools_platforms partial), nothing else. In that one exception, cv_section/entry_reference/evidence_basis are still filled in normally (e.g. cv_section "skills", entry_reference "Skills list", evidence_basis "Python listed among skills, not shown in use"); only evidence_type is "none".
The same real entry may legitimately support every one of these five subcriteria (e.g. one strong project can fully support applied_evidence, applied_skill, skill_application, results, and tools_platforms at once, since those are five different questions about the same real thing) — write each evidence_basis as its own independent one sentence explanation of how that entry answers that specific question, never the identical sentence copy pasted across fields.

- applied_evidence_level / applied_evidence: relevant projects and practical work — this includes paid employment exactly as readily as personal, academic, bootcamp, internship, apprenticeship, research, freelance, or volunteer work; judge the work itself, never the employment status behind it. "strong" requires the CV to show, for at least one credible and clearly relevant piece of work: what it actually was and how it relates to this role, the candidate's own contribution to it (not just a team or employer's outcome), a level of complexity or ownership appropriate to this role's advertised seniority, and enough specificity to be credible, not a one line mention or a generic restatement of the job title. "partial" requires some identifiable relevant activity with a real (if incomplete) contribution, but missing depth, complexity, or outcome — e.g. vague responsibility statements with no real detail, or credit that reads as the team's rather than the candidate's own. "none" covers both weak/unclear activity and no activity at all — there is no credible applied evidence to point to. Never "strong" or "partial" from a skills list or summary alone.
- applied_skill_evidence_level / applied_skill_evidence: application of relevant skills — evidence that the candidate has actually put relevant skills into practice somewhere in the CV (any project, role, or activity), as distinct from simply listing skills. "strong" means repeated or substantial use of relevant skills in a real context; "partial" means at least one credible, if narrower, example of relevant use; "none" means skills are only listed, never shown in use anywhere, or the only contextual evidence is too weak to credit. Never "strong" or "partial" from a skills list or summary alone.
- results_evidence_level / results_evidence: results, completed deliverables, and demonstrated learning — a credible outcome, a shipped or completed deliverable, a measurable improvement, or clearly demonstrated learning/growth from any of the evidence above. Accept qualitative outcomes (e.g. "built and deployed a working prototype used by classmates") exactly as readily as quantified ones; do not penalize the absence of a metric. The mere presence of relevant keywords or a skills list can never earn "strong" or "partial" here — there must be an actual completed deliverable, outcome, or clearly demonstrated learning tied to a specific entry.
- skill_application_evidence_level / skill_application_evidence: evidence of using the specific essential skills this vacancy asks for (distinct from applied_skill_evidence_level above, which looks at practical application broadly) — for the must_have and important skills you classified in the requirement matrix, "strong" requires clear use of those skills to perform meaningful work or produce a relevant deliverable; "partial" requires credible but narrower application; "none" if the essential skills are only listed, never shown in use, or a claimed skill has no supporting use at all. Never "strong" or "partial" from a skills list or summary alone.
- tools_platforms_evidence_level / tools_platforms_evidence: relevant tools, platforms, and technical methods (e.g. cloud platforms, ML frameworks, CI/CD tools, specific software) that this role calls for. A tool that appears only in a skills list may earn "partial" for claimed familiarity, but "strong" always requires the tool to be evidenced by actual, contextual use, not a bare mention.
- certifications_evidence_level / certifications_evidence: relevant education, training, or certifications. These support the evaluation but must never replace practical evidence — do not let a strong credential here compensate for weak evidence elsewhere; score this subcriterion only on the credential itself.
- role_fit_evidence_level / role_fit_evidence: how clearly the overall CV fits this specific position and its advertised seniority level. Judge fit for THIS role as posted, not a generic impression of the candidate's quality. Critically: a candidate having limited or no formal employment history must never by itself be read as weak role fit — assess fit from the total evidence (including projects), never from years of employment alone.
- technical_communication_level / technical_communication_evidence: how clearly the CV explains its own technical work — can a recruiter who is not a specialist in this field understand what the candidate actually did and why it mattered, from the CV text alone.
- cv_structure_level: how readable, relevant, and well structured the CV itself is (clear sections, logical order, appropriate length and focus on relevant content, easy to scan) — a formatting and organization judgment about the document, not a factual claim, so it has no evidence excerpt.

Do not double count the same fact across these subcriteria and the requirement matrix or UVP above without justification: the same piece of relevant work (a job, a project, or any other evidence source) can legitimately support applied_evidence_level (that it exists and is relevant), results_evidence_level (its outcome), and skill_application_evidence_level (a specific essential skill it demonstrates) because those are three different questions about it, but do not inflate multiple subcriteria by restating the identical single fact as if it were independent new evidence.

== STEP 3: EXTRACTION AND CONTEXT ==

Also populate job_title and company_name: ${
    context.jobTitle || context.companyName
      ? `these are already known (job_title: ${context.jobTitle ?? 'unknown'}, company_name: ${context.companyName ?? 'unknown'}) — return them back exactly as given for whichever one is known; only extract the other one yourself if it says "unknown" above.`
      : 'extract both directly from the job description text.'
  } job_title is the specific role title as literally stated in the job description (e.g. "Senior Backend Engineer"), not a paraphrase. company_name is the hiring company's name as literally stated. If the job description genuinely does not state one of these clearly (e.g. a confidential/blind posting with no company named, or phrasing too generic to name a specific title), return an empty string for that field rather than guessing or inventing a plausible-sounding value — an empty string is always safer than a wrong guess here.

Write every field entirely in English, regardless of what language the job description or CV are written in.

Then write feedback that helps the candidate see their own application the way a recruiter would — direct, specific, evidence-based, technical, and never generic. This feedback must be grounded in the same requirement matrix and UVP evidence you just produced, not a fresh, independent impression of the CV. Each strength and area to improve is split into two separate fields: a "_finding" field and an "_evidence" field. When a feedback item is used, both fields must be non empty, and the evidence must add genuinely new information rather than restating the finding. When there is no evidence based item for a slot, return an empty string for all fields in that slot. The "_finding" field is a 2 to 5 word bolded lead-in naming the pattern or action, e.g. "Strong sales performance" or "Quantify your impact" (no trailing period needed, it will be rendered as a heading). The matching "_evidence" field is one full sentence giving the detail behind it, e.g. "Your record of exceeding sales targets directly supports the role's revenue expectations."
- strength_1_finding / strength_1_evidence and strength_2_finding / strength_2_evidence: include up to two genuine strengths. Base these primarily on requirements you marked "strong" and, where relevant, on "strong" or "partial" UVP evidence. Never invent a strength to fill both slots. If only one genuine strength exists, leave the second slot empty. If none exist, leave both slots empty. The finding names the underlying pattern that makes the CV effective, the way a recruiter commenting on craft would. Never restate or quote a specific achievement bullet from the CV in the finding — the candidate already knows what they wrote, so quoting it back adds nothing. The evidence states why that pattern specifically matters to this employer for this role (the Employer Value step of the Evidence, Strength, Employer Value framework). If there's genuinely no quantification anywhere, base strengths on other real craft signals present (e.g. clear ownership/scope language, relevant tools named, well-structured bullets) — never invent a pattern that isn't there.
- improvement_1_finding / improvement_1_evidence / improvement_1_example, improvement_2_finding / improvement_2_evidence / improvement_2_example, and improvement_3_finding / improvement_3_evidence / improvement_3_example: include only genuine improvements grounded in requirements marked "partial" or "none", weak UVP evidence, or real presentation weaknesses. For an application likely to score from 61 through 84, provide three distinct, relevant improvements and a practical example for every one. Never duplicate the same weakness to fill the three slots. For a very strong application, prioritize only the single most useful refinement. The finding is a direct, imperative action, e.g. "Quantify your impact" or "Strengthen leadership evidence." Never hedge with phrasing like "Consider adding", "You may want to", or "It would be helpful to". The evidence states the specific improvement to make. Address quantification only when the CV genuinely lacks useful metrics. Push the candidate to elaborate on the most relevant experience only when it is genuinely too shallow for this role. Each example should use generic placeholders such as X%, €X, X customers, or X hours, never an invented number. Phrase gaps as what the CV does not show rather than as a claim about what the candidate lacks in real life. If the final deterministic score falls in Needs Improvement and the model provides fewer than three valid items, the application will safely complete the set from the verified requirement matrix and UVP level.
- prospect_1 and prospect_2: include up to two plain, concise, evidence based sentences. Use one sentence on why the candidate can still be competitive for this role or closely related roles, and one sentence on which single improvement would most increase interview likelihood, but only when the requirement matrix supports each statement. Leave any unsupported slot empty rather than adding generic encouragement.

Finally, self check your own output and populate new_claims_introduced: a JSON array of any specific fact (a metric, employer name, date, credential, or achievement) that you stated about the candidate anywhere in strengths, improvements, or prospects that is not actually present in the original CV text. Placeholder values like "X%" are never claims and must never appear in this list. If, after careful review, you introduced no such fact, return an empty array.

Never use hyphens, en dashes, or em dashes anywhere in your output text (no "-", "–", or "—", including inside compound words). Write in plain sentences instead, using commas, periods, or separate words (e.g. "well structured" not "well-structured", "data driven" not "data-driven").`

  const userPrompt = `Job title: ${context.jobTitle ?? 'Not specified'}
Company: ${context.companyName ?? 'Not specified'}

Job description:
${jobDescription}

CV:
${cvText}`

  // Retry-only correction turn: uses the exact same job description and CV
  // above (never re-sent or altered), just tells the model specifically
  // what its previous response got wrong so the second attempt has a real
  // chance of fixing it rather than repeating the same mistake.
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
    ...(correctionNote
      ? [
          {
            role: 'user',
            content: `Your previous response to this exact request was rejected by validation for this reason: ${correctionNote}\n\nUsing the same job description and CV above, correct this specific issue and return a fully valid response that still follows every instruction in the system message.`,
          },
        ]
      : []),
  ]

  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      // 0, not the previous 0.4 — requirement classification, evidence
      // matching, and UVP evidence level feed directly into the
      // deterministic score formula below, so this call must vary as little
      // as possible run to run. The feedback prose sharing this same call
      // inherits temperature 0 too rather than splitting into a second call,
      // which the audit's own "smallest safe implementation path" guidance
      // favors over adding a second network round trip for this.
      temperature: 0,
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'recruiter_check_feedback',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              job_title: {
                type: 'string',
                description: 'The role title as literally stated in the job description, or an empty string if not clearly stated.',
              },
              company_name: {
                type: 'string',
                description: "The hiring company's name as literally stated in the job description, or an empty string if not clearly stated.",
              },
              requirements: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    requirement: { type: 'string' },
                    category: { type: 'string', enum: ['experience', 'skills'] },
                    importance: { type: 'string', enum: ['must_have', 'important', 'nice_to_have'] },
                    critical: { type: 'boolean' },
                    match_strength: { type: 'string', enum: ['strong', 'partial', 'none'] },
                    cv_evidence: {
                      type: 'string',
                      description: 'A short excerpt of the CV\'s own text, word for word, supporting a strong or partial match. Empty string for a none match.',
                    },
                  },
                  required: ['requirement', 'category', 'importance', 'critical', 'match_strength', 'cv_evidence'],
                  additionalProperties: false,
                },
                description: 'The extracted, classified job requirements with their CV match. The application calculates experience and skills scores from this, not the model.',
              },
              uvp_evidence_level: { type: 'string', enum: ['strong', 'partial', 'none'] },
              uvp_evidence: {
                type: 'string',
                description: 'A short excerpt of the CV\'s own text, word for word, supporting the UVP evidence level. Empty string for none.',
              },
              applied_evidence_level: { type: 'string', enum: ['strong', 'partial', 'none'] },
              applied_evidence: { type: 'string', description: 'Excerpt supporting applied_evidence_level, word for word. Empty string for none.' },
              applied_evidence_reference: EVIDENCE_REFERENCE_SCHEMA,
              applied_skill_evidence_level: { type: 'string', enum: ['strong', 'partial', 'none'] },
              applied_skill_evidence: { type: 'string', description: 'Excerpt supporting applied_skill_evidence_level, word for word. Empty string for none.' },
              applied_skill_reference: EVIDENCE_REFERENCE_SCHEMA,
              results_evidence_level: { type: 'string', enum: ['strong', 'partial', 'none'] },
              results_evidence: { type: 'string', description: 'Excerpt supporting results_evidence_level, word for word. Empty string for none.' },
              results_reference: EVIDENCE_REFERENCE_SCHEMA,
              skill_application_evidence_level: { type: 'string', enum: ['strong', 'partial', 'none'] },
              skill_application_evidence: { type: 'string', description: 'Excerpt supporting skill_application_evidence_level, word for word. Empty string for none.' },
              skill_application_reference: EVIDENCE_REFERENCE_SCHEMA,
              tools_platforms_evidence_level: { type: 'string', enum: ['strong', 'partial', 'none'] },
              tools_platforms_evidence: { type: 'string', description: 'Excerpt supporting tools_platforms_evidence_level, word for word. Empty string for none.' },
              tools_platforms_reference: EVIDENCE_REFERENCE_SCHEMA,
              certifications_evidence_level: { type: 'string', enum: ['strong', 'partial', 'none'] },
              certifications_evidence: { type: 'string', description: 'Excerpt supporting certifications_evidence_level, word for word. Empty string for none.' },
              role_fit_evidence_level: { type: 'string', enum: ['strong', 'partial', 'none'] },
              role_fit_evidence: { type: 'string', description: 'Excerpt supporting role_fit_evidence_level, word for word. Empty string for none.' },
              technical_communication_level: { type: 'string', enum: ['strong', 'partial', 'none'] },
              technical_communication_evidence: { type: 'string', description: 'Excerpt supporting technical_communication_level, word for word. Empty string for none.' },
              cv_structure_level: {
                type: 'string',
                enum: ['strong', 'partial', 'none'],
                description: 'A formatting/organization judgment about the CV document itself — no evidence excerpt, since this is not a factual claim.',
              },
              strength_1_finding: { type: 'string' },
              strength_1_evidence: { type: 'string' },
              strength_2_finding: { type: 'string' },
              strength_2_evidence: { type: 'string' },
              improvement_1_finding: { type: 'string' },
              improvement_1_evidence: { type: 'string' },
              improvement_1_example: { type: 'string' },
              improvement_2_finding: { type: 'string' },
              improvement_2_evidence: { type: 'string' },
              improvement_2_example: { type: 'string' },
              improvement_3_finding: { type: 'string' },
              improvement_3_evidence: { type: 'string' },
              improvement_3_example: { type: 'string' },
              prospect_1: { type: 'string' },
              prospect_2: { type: 'string' },
              new_claims_introduced: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Any specific fact about the candidate stated in strengths/improvements/prospects that is not present in the original CV. Empty array if none.',
              },
            },
            required: [
              'job_title',
              'company_name',
              'requirements',
              'uvp_evidence_level',
              'uvp_evidence',
              'applied_evidence_level',
              'applied_evidence',
              'applied_evidence_reference',
              'applied_skill_evidence_level',
              'applied_skill_evidence',
              'applied_skill_reference',
              'results_evidence_level',
              'results_evidence',
              'results_reference',
              'skill_application_evidence_level',
              'skill_application_evidence',
              'skill_application_reference',
              'tools_platforms_evidence_level',
              'tools_platforms_evidence',
              'tools_platforms_reference',
              'certifications_evidence_level',
              'certifications_evidence',
              'role_fit_evidence_level',
              'role_fit_evidence',
              'technical_communication_level',
              'technical_communication_evidence',
              'cv_structure_level',
              'strength_1_finding',
              'strength_1_evidence',
              'strength_2_finding',
              'strength_2_evidence',
              'improvement_1_finding',
              'improvement_1_evidence',
              'improvement_1_example',
              'improvement_2_finding',
              'improvement_2_evidence',
              'improvement_2_example',
              'improvement_3_finding',
              'improvement_3_evidence',
              'improvement_3_example',
              'prospect_1',
              'prospect_2',
              'new_claims_introduced',
            ],
            additionalProperties: false,
          },
        },
      },
    }),
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
