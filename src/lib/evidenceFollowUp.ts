// Evidence Follow Up: the wording and the answer rules the UI shares.
//
// The candidate's answer is self reported and unverified. Everything here is
// written so the follow up reads as a chance to surface evidence that already
// exists, never as a way to add qualifications or to negotiate the score.

import type { RequirementEvidenceRow } from '@/types'

export const FOLLOW_UP_HEADING = 'One question before you finish'
export const FOLLOW_UP_OPTIONAL_NOTE = 'Optional. Your score can only go up or stay the same.'
// Guidance only: never sent with the answer, and an answer that copies it is
// refused. The server keeps an identical copy for that check (same name, in
// supabase/functions/analyze-check/evidence-follow-up.ts); a test keeps them equal.
export const FOLLOW_UP_EXAMPLE =
  'Users were dropping off during onboarding. I simplified the signup process, increasing completion from 62% to 78%.'
export const FOLLOW_UP_EXAMPLE_COPY_MESSAGE = 'That is our example. Describe your own experience in your own words.'
export const FOLLOW_UP_SUBMIT_LABEL = 'Update Recruiter Check'
export const FOLLOW_UP_SUBMITTING_LABEL = 'Updating...'
export const FOLLOW_UP_WORKING_MESSAGE =
  'Your recruiter is reassessing your application with your answer. This usually takes under a minute.'
export const CANDIDATE_REPORTED_LABEL = 'Candidate reported, not on your CV'
export const UPDATED_REPORT_NOTE =
  'Updated after your follow up answer. Includes evidence you reported that is not on your CV.'
export const FOLLOW_UP_FAILURE_PREFIX = 'Your original result is unchanged.'

// The same limits the server enforces (assess-evidence-follow-up validates
// with validateFollowUpAnswer in supabase/functions/analyze-check/
// evidence-follow-up.ts, which is authoritative). Kept in step by a test in
// that folder. The client copy exists only so the message appears without a
// round trip; it never replaces the server check.
export const MIN_ANSWER_CHARS = 40
export const MIN_ANSWER_WORDS = 8
export const MAX_ANSWER_CHARS = 1500

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

// Same rule as copiesFollowUpExample on the server: an answer holding most of the
// example's distinctive words and figures is the example, not evidence.
const EXAMPLE_STOPWORDS = new Set(['were', 'from', 'during', 'with', 'that', 'this', 'have', 'into', 'over', 'they', 'their', 'then', 'than'])
const EXAMPLE_COPY_SHARE = 0.7

function exampleTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => /^\d+$/.test(token) || (token.length >= 4 && !EXAMPLE_STOPWORDS.has(token))),
  )
}

export function copiesFollowUpExample(answer: string): boolean {
  const example = [...exampleTokens(FOLLOW_UP_EXAMPLE)]
  const tokens = exampleTokens(answer)
  return example.filter((token) => tokens.has(token)).length / example.length >= EXAMPLE_COPY_SHARE
}

/** null when the draft may be submitted, otherwise the reason it may not. */
export function answerProblem(draft: string): string | null {
  const trimmed = draft.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > MAX_ANSWER_CHARS) return `Keep your answer under ${MAX_ANSWER_CHARS} characters.`
  if (trimmed.length < MIN_ANSWER_CHARS || countWords(trimmed) < MIN_ANSWER_WORDS) {
    return 'Add a little more detail about what you did, so the recruiter has something specific to assess.'
  }
  if (copiesFollowUpExample(trimmed)) return FOLLOW_UP_EXAMPLE_COPY_MESSAGE
  return null
}

export function canSubmitAnswer(draft: string): boolean {
  const trimmed = draft.trim()
  return trimmed.length > 0 && answerProblem(draft) === null
}

export const FOLLOW_UP_POLL_MS = 3000
export const FOLLOW_UP_POLL_MAX_MS = 90_000
export const FOLLOW_UP_UNCONFIRMED_MESSAGE =
  'Could not confirm your update. Your original result is unchanged. Please try again.'

/**
 * One submission at a time. The form disables its button while a request is
 * in flight, but a state update is not visible to a second click fired in the
 * same frame; this guard is, so one answer can never become two Analyze
 * calls. A failure is returned, never thrown, and releases the guard so the
 * candidate can retry with the same answer.
 */
export function createSubmissionGuard() {
  let inFlight = false
  return async function run<T>(
    work: () => Promise<T>,
  ): Promise<{ status: 'ok'; value: T } | { status: 'busy' } | { status: 'error'; message: string }> {
    if (inFlight) return { status: 'busy' }
    inFlight = true
    try {
      return { status: 'ok', value: await work() }
    } catch (error) {
      return {
        status: 'error',
        message:
          error instanceof Error && error.message
            ? error.message
            : `Could not update your Recruiter Check. ${FOLLOW_UP_FAILURE_PREFIX}`,
      }
    } finally {
      inFlight = false
    }
  }
}

/**
 * Decides what a submission's outcome is once the request has returned.
 *
 * `accepted` means the server answered success, so the assessed row is
 * already there and anything else is a failure. Otherwise the connection
 * dropped (or the server said 409, already being assessed): the server may
 * still be working, so wait for the row to report 'assessed', but stop the
 * moment it is back at 'pending' (the server released it and nothing more is
 * coming) or the wait runs out. Never makes another Analyze call: it only
 * reads.
 */
export async function resolveFollowUpOutcome<T extends { status: string }>(options: {
  accepted: boolean
  getFollowUp: () => Promise<T | null>
  sleep: (ms: number) => Promise<void>
  now: () => number
}): Promise<T> {
  const startedAt = options.now()
  for (;;) {
    const followUp = await options.getFollowUp()
    if (followUp?.status === 'assessed') return followUp
    const stillWorking = followUp?.status === 'processing'
    if (options.accepted || !stillWorking || options.now() - startedAt > FOLLOW_UP_POLL_MAX_MS) break
    await options.sleep(FOLLOW_UP_POLL_MS)
  }
  throw new Error(FOLLOW_UP_UNCONFIRMED_MESSAGE)
}

// ---------------------------------------------------------------------------
// One score. Mirrors supabase/functions/_shared/follow-up-result.ts, which is
// authoritative and used by the functions; a test in supabase/functions/
// _shared/follow-up-result.test.ts runs both against the same cases.
// ---------------------------------------------------------------------------

// The Needs Improvement band: the only results offered a follow up.
export const FOLLOW_UP_MIN_SCORE = 61
export const FOLLOW_UP_MAX_SCORE = 84

export function isFollowUpEligibleScore(score: unknown): score is number {
  return (
    typeof score === 'number' &&
    Number.isFinite(score) &&
    score >= FOLLOW_UP_MIN_SCORE &&
    score <= FOLLOW_UP_MAX_SCORE
  )
}

export interface ReportResult {
  score: number
  strengths: string[]
  improvements: string[]
  prospects: string[]
  // Additive, new in prompt v7. Never part of the "does the follow up
  // replace the original" gate below — read defensively, default to [].
  requirementEvidence: RequirementEvidenceRow[]
  recruiterDoubts: string[]
}

export interface StoredFollowUp {
  status?: string | null
  final_score?: number | null
  final_strengths?: string[] | null
  final_improvements?: string[] | null
  final_prospects?: string[] | null
  final_requirement_evidence?: unknown
  final_recruiter_doubts?: string[] | null
}

export interface EffectiveResult extends ReportResult {
  updated: boolean
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isRequirementEvidenceRowArray(value: unknown): value is RequirementEvidenceRow[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as RequirementEvidenceRow).requirement === 'string' &&
        typeof (item as RequirementEvidenceRow).evidence_found === 'string' &&
        typeof (item as RequirementEvidenceRow).recruiter_interpretation === 'string',
    )
  )
}

/**
 * The one result the report and the check list show. The follow up replaces
 * the original only when it is assessed, holds a whole score strictly above
 * the original, and carries its own feedback; the score and the feedback move
 * together, and the original score is never shown beside the new one.
 */
export function resolveEffectiveResult(base: ReportResult, followUp: StoredFollowUp | null | undefined): EffectiveResult {
  if (
    followUp &&
    followUp.status === 'assessed' &&
    typeof followUp.final_score === 'number' &&
    Number.isInteger(followUp.final_score) &&
    followUp.final_score > base.score &&
    followUp.final_score <= 100 &&
    isStringArray(followUp.final_strengths) &&
    isStringArray(followUp.final_improvements) &&
    isStringArray(followUp.final_prospects)
  ) {
    return {
      score: followUp.final_score,
      strengths: followUp.final_strengths,
      improvements: followUp.final_improvements,
      prospects: followUp.final_prospects,
      requirementEvidence: isRequirementEvidenceRowArray(followUp.final_requirement_evidence)
        ? followUp.final_requirement_evidence
        : [],
      recruiterDoubts: isStringArray(followUp.final_recruiter_doubts) ? followUp.final_recruiter_doubts : [],
      updated: true,
    }
  }
  return { ...base, updated: false }
}
