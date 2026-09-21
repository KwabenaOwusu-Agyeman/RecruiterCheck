// Evidence Follow Up, second stage.
//
// The candidate answers the ONE question offered on a completed check. This
// function adds that answer to the CV text as a labelled, self reported,
// unverified section and runs the very same analysis and scoring pipeline as
// the initial check (analyze-check's prompt, schema, validation, grounding
// and weighted formula, imported, not copied), once. The result is stored on
// the check's evidence_follow_ups row and shown beside the initial score.
//
// What it never does:
// - write to `checks`, `feedback` or `check_score_audits`: the completed
//   check and its initial score stay exactly as they were;
// - consume a credit or a free check: the follow up is part of the check the
//   candidate already paid for;
// - run more than once per check: the row's status is claimed atomically
//   (pending to processing) so a double submit, two tabs or a retry loop
//   cannot start a second analysis, and an assessed row is never reopened;
// - lose the initial result on failure: any failure releases the row back to
//   pending and returns an error, leaving everything else untouched.
//
// Rate limiting: one Analyze call, drawn from the same bucket, limit and
// window as analyze-check (see RATE_LIMIT_* in analyze-check/runtime.ts).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { isOwnStoragePath } from '../_shared/storage-path.ts'
import { buildFollowUpCvText, buildWhatChanged, validateFollowUpAnswer } from '../analyze-check/evidence-follow-up.ts'
import { classifyValidationFailure } from '../analyze-check/logic.ts'
import {
  extractText,
  generateFeedback,
  RATE_LIMIT_BUCKET,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_SECONDS,
} from '../analyze-check/runtime.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// A row left in 'processing' (the function was killed mid call) is reclaimable
// after this long, so a crash cannot strand the candidate's one opportunity.
// Comfortably longer than the two 45 second model attempts plus parsing.
const STALE_PROCESSING_MS = 3 * 60 * 1000

const GENERIC_FAILURE = 'Could not update your Recruiter Check. Your original result is unchanged. Please try again.'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing authorization header' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) return jsonResponse({ error: 'Analysis service is not configured' }, 503)

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

    let body: { checkId?: unknown; answer?: unknown }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid request' }, 400)
    }
    const checkId = typeof body.checkId === 'string' ? body.checkId : ''
    if (!checkId) return jsonResponse({ error: 'checkId is required' }, 400)

    // Refused before any lookup, rate limit hit or model call, so a too short
    // answer costs the candidate neither their one opportunity nor an
    // Analyze call.
    const validation = validateFollowUpAnswer(body.answer)
    if (!validation.ok) return jsonResponse({ error: validation.message }, 400)
    const answer = validation.answer

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: check, error: checkError } = await adminClient
      .from('checks')
      .select(
        'id, status, job_title, company_name, job_description, cv_storage_path, cv_file_name, uploads_purged, interview_probability_score',
      )
      .eq('id', checkId)
      .eq('user_id', user.id)
      .single()
    if (checkError || !check) return jsonResponse({ error: 'Check not found' }, 404)
    if (check.status !== 'completed' || typeof check.interview_probability_score !== 'number') {
      return jsonResponse({ error: 'This check is not complete yet' }, 409)
    }
    if (check.uploads_purged || !check.cv_storage_path || !check.job_description) {
      // Uploads are deleted automatically within 24 hours. The follow up needs
      // the original CV and job description, and they are never kept longer
      // just to allow it.
      return jsonResponse(
        { error: 'Your CV and job description have been deleted, so this check can no longer be updated.' },
        410,
      )
    }

    // The service role downloads this path below, bypassing Storage policies,
    // so it must sit inside the caller's own folder (same guard as
    // analyze-check). Refused before the row is claimed or anything is spent.
    if (!isOwnStoragePath(check.cv_storage_path, user.id)) {
      console.error('assess-evidence-follow-up: CV path outside the owner folder', { checkId })
      return jsonResponse({ error: GENERIC_FAILURE }, 400)
    }

    const { data: followUp, error: followUpError } = await adminClient
      .from('evidence_follow_ups')
      .select('id, status, question, answered_at')
      .eq('check_id', checkId)
      .maybeSingle()
    if (followUpError) {
      console.error('assess-evidence-follow-up: lookup failed', { checkId, message: followUpError.message })
      return jsonResponse({ error: GENERIC_FAILURE }, 500)
    }
    if (!followUp) return jsonResponse({ error: 'There is no follow up question for this check' }, 404)
    if (followUp.status === 'assessed') {
      return jsonResponse({ error: 'This follow up has already been answered' }, 409)
    }

    // Atomic claim. Only the request that flips pending (or a stale
    // processing row) to processing proceeds; a concurrent or repeated
    // submission matches zero rows here and stops, before any rate limit
    // slot or model call is spent.
    const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS).toISOString()
    const { data: claimed, error: claimError } = await adminClient
      .from('evidence_follow_ups')
      .update({ status: 'processing', candidate_answer: answer, answered_at: new Date().toISOString() })
      .eq('id', followUp.id)
      .or(`status.eq.pending,and(status.eq.processing,answered_at.lt.${staleBefore})`)
      .select('id')
    if (claimError) {
      console.error('assess-evidence-follow-up: claim failed', { checkId, message: claimError.message })
      return jsonResponse({ error: GENERIC_FAILURE }, 500)
    }
    if (!claimed || claimed.length === 0) {
      return jsonResponse({ error: 'Your answer is already being assessed' }, 409)
    }

    const release = async () => {
      const { error } = await adminClient
        .from('evidence_follow_ups')
        .update({ status: 'pending', candidate_answer: null, answered_at: null })
        .eq('id', followUp.id)
        .eq('status', 'processing')
      if (error) {
        console.error('assess-evidence-follow-up: release failed', { checkId, message: error.message })
      }
    }

    // The same bucket as analyze-check: this is the second and last Analyze
    // call a Recruiter Check flow can make.
    const { data: rateLimitAllowed, error: rateLimitError } = await adminClient.rpc('check_and_record_rate_limit', {
      p_user_id: user.id,
      p_bucket: RATE_LIMIT_BUCKET,
      p_limit: RATE_LIMIT_MAX,
      p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    })
    if (rateLimitError) {
      console.error('assess-evidence-follow-up: rate limit check failed', { checkId, message: rateLimitError.message })
      await release()
      return jsonResponse({ error: 'Could not process this request. Please try again.' }, 500)
    }
    if (!rateLimitAllowed) {
      await release()
      return jsonResponse({ error: 'Too many analysis requests. Please try again later.' }, 429)
    }

    const { data: cvFile, error: downloadError } = await adminClient.storage
      .from('cvs')
      .download(check.cv_storage_path)
    if (downloadError || !cvFile) {
      console.error('assess-evidence-follow-up: CV download failed', { checkId, message: downloadError?.message })
      await release()
      return jsonResponse({ error: GENERIC_FAILURE }, 400)
    }

    let cvText: string
    try {
      cvText = await extractText(cvFile, check.cv_file_name)
    } catch (error) {
      console.error('assess-evidence-follow-up: CV parsing failed', {
        checkId,
        message: error instanceof Error ? error.message : String(error),
      })
      await release()
      return jsonResponse({ error: GENERIC_FAILURE }, 400)
    }

    let result: Awaited<ReturnType<typeof generateFeedback>>
    try {
      result = await generateFeedback(
        openaiApiKey,
        buildFollowUpCvText(cvText, followUp.question, answer),
        check.job_description,
        { jobTitle: check.job_title, companyName: check.company_name, followUp: true },
      )
    } catch (error) {
      // Same rule as analyze-check: an invalid or failed generation is never
      // turned into a made up result, and the raw message (which can echo
      // model text) is classified into a fixed code and discarded.
      const message = error instanceof Error ? error.message : String(error)
      console.error('assess-evidence-follow-up: both attempts invalid, failing safely', {
        checkId,
        reasonCode: classifyValidationFailure(message),
      })
      await release()
      return jsonResponse({ error: GENERIC_FAILURE }, 502)
    }

    const analysis = result.analysis
    const finalScore = analysis.interview_probability_score
    const { data: saved, error: saveError } = await adminClient
      .from('evidence_follow_ups')
      .update({
        status: 'assessed',
        final_score: finalScore,
        final_strengths: analysis.strengths,
        final_improvements: analysis.improvements,
        final_prospects: analysis.prospects,
        what_changed: buildWhatChanged(check.interview_probability_score, finalScore),
        assessed_at: new Date().toISOString(),
      })
      .eq('id', followUp.id)
      .eq('status', 'processing')
      .select('id')
    if (saveError || !saved || saved.length === 0) {
      console.error('assess-evidence-follow-up: save failed', { checkId, message: saveError?.message })
      await release()
      return jsonResponse({ error: GENERIC_FAILURE }, 500)
    }

    console.log(
      'assess-evidence-follow-up-monitoring',
      JSON.stringify({
        outcome: 'success',
        firstAttemptSuccess: result.metrics.firstAttemptSuccess,
        retryUsed: result.metrics.retryUsed,
        totalDurationMs: result.metrics.totalDurationMs,
        model: result.metrics.model,
        totalTokens: result.metrics.usage?.totalTokens ?? null,
      }),
    )

    return jsonResponse({ success: true, checkId })
  } catch (error) {
    console.error('assess-evidence-follow-up error:', error instanceof Error ? error.message : String(error))
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
