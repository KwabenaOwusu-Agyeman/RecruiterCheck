import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { classifyValidationFailure, toAuditRecord, type AnalysisResult } from './logic.ts'
import { isFollowUpEligibleScore } from '../_shared/follow-up-result.ts'
import { fileExtensionForLog, isOwnStoragePath } from '../_shared/storage-path.ts'
import {
  extractText,
  generateFeedback,
  RATE_LIMIT_BUCKET,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_SECONDS,
  type GenerateFeedbackMetrics,
} from './runtime.ts'
import { buildBrevoPayload, isTestAccountEmail, resolveSendDecision } from './trustpilot-email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Actual enforcement of the free-check limit lives in the
// reserve_check_analysis Postgres function (see migration
// switch_to_weekly_allotment_plans), which atomically checks and reserves a
// slot under a row lock — this constant exists here only to build the
// matching user-facing error message; keep it in sync with the limit
// hardcoded in that function. The weekly period limit varies by plan, so
// its message is built from the profile's own period_checks_limit instead
// of a hardcoded constant.
const FREE_TIER_LIFETIME_LIMIT = 1

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

    // The service role downloads this path below, bypassing Storage policies,
    // so it must be inside the caller's own folder. Refused before anything
    // is reserved, so nothing changes state.
    if (!isOwnStoragePath(check.cv_storage_path, user.id)) {
      console.error('analyze-check: CV path outside the owner folder', { checkId })
      return jsonResponse({ error: 'Could not read CV file' }, 400)
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
        fileType: fileExtensionForLog(check.cv_file_name),
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
      // The call can report an error after its transaction committed (the
      // connection dropped on the way back). Read the row before undoing
      // anything: a completed, paid check must keep its feedback.
      const { data: afterError } = await adminClient.from('checks').select('status').eq('id', checkId).maybeSingle()
      if (afterError?.status !== 'completed') {
        // complete_check_analysis is one plpgsql call: if it raised partway
        // through, Postgres rolled back everything it did (status, scores,
        // credit, ledger), so no credit was consumed. The feedback saved above
        // is removed, because the results page shows any feedback row and
        // leaving it would hand over the analysis without a credit being used.
        const { error: feedbackCleanupError } = await adminClient.from('feedback').delete().eq('check_id', checkId)
        if (feedbackCleanupError) {
          console.error('analyze-check: could not remove feedback after a failed completion', { checkId })
        }
        await markFailed(adminClient, checkId, 'Could not save analysis result')
        return jsonResponse({ error: 'Could not save analysis result' }, 500)
      }
      console.error('analyze-check: completion reported an error but the check is completed', { checkId })
    }

    // Evidence Follow Up: when the analysis found a genuine evidence gap and the
    // result is Needs Improvement (61 to 84), offer the candidate one optional
    // question about it. Written to its own table,
    // never to `checks`, so the completed check stays immutable. Best effort
    // and non-blocking, like the email below: a failure here (or the table not
    // existing yet, if this deploys before the migration) must never turn a
    // completed check into an error. ignoreDuplicates keeps it to one row per
    // check even if this path ever runs twice.
    if (analysis.evidence_gap && isFollowUpEligibleScore(analysis.interview_probability_score)) {
      const { error: followUpError } = await adminClient.from('evidence_follow_ups').upsert(
        {
          check_id: checkId,
          gap_requirement: analysis.evidence_gap.requirement,
          gap_summary: analysis.evidence_gap.summary,
          question: analysis.evidence_gap.question,
        },
        { onConflict: 'check_id', ignoreDuplicates: true },
      )
      if (followUpError) {
        console.error('analyze-check: evidence follow up not saved', { checkId, message: followUpError.message })
      }
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
  // Only a check that is still running: never turn a completed (and paid)
  // check into a failed one, which would let a Retry charge it again.
  await client
    .from('checks')
    .update({ status: 'failed', error_message: message })
    .eq('id', checkId)
    .eq('status', 'processing')
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
