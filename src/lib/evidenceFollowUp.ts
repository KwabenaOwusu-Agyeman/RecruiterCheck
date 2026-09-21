// Evidence Follow Up: the wording and the answer rules the UI shares.
//
// The candidate's answer is self reported and unverified. Everything here is
// written so the follow up reads as a chance to surface evidence that already
// exists, never as a way to add qualifications or to negotiate the score.

export const INITIAL_SCORE_LABEL = 'Initial Recruiter Score'
export const FINAL_SCORE_LABEL = 'Final Recruiter Score'

export const FOLLOW_UP_HEADING = 'One question before you finish'
export const FOLLOW_UP_INTRO = 'The most important evidence gap in your check'
export const FOLLOW_UP_OPTIONAL_NOTE = 'Optional. You can skip this and your result stays as it is.'
export const FOLLOW_UP_INTEGRITY_NOTE =
  'Only answer if this is genuinely true for you. This is a chance to show evidence you already have, not to add anything new. What you write is self reported, so it is weighed with more caution than evidence in your CV, and it does not change your score unless it is specific and relevant.'
export const FOLLOW_UP_SUBMIT_LABEL = 'Update Recruiter Check'
export const FOLLOW_UP_SUBMITTING_LABEL = 'Updating...'
export const FOLLOW_UP_WORKING_MESSAGE =
  'Your recruiter is reassessing your application with your answer. This usually takes under a minute.'
export const CANDIDATE_REPORTED_LABEL = 'Candidate reported, not on your CV'
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

/** null when the draft may be submitted, otherwise the reason it may not. */
export function answerProblem(draft: string): string | null {
  const trimmed = draft.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > MAX_ANSWER_CHARS) return `Keep your answer under ${MAX_ANSWER_CHARS} characters.`
  if (trimmed.length < MIN_ANSWER_CHARS || countWords(trimmed) < MIN_ANSWER_WORDS) {
    return 'Add a little more detail about what you did, so the recruiter has something specific to assess.'
  }
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
