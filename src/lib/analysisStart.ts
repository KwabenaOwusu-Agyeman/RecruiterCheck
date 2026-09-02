/**
 * Starting a check without waiting for it to finish.
 *
 * analyze-check holds its HTTP response until the CV is parsed and the model
 * has answered, which is routinely 30 to 60 seconds and up to twice that when
 * the first model attempt is rejected. A phone on a weak signal, or a tab
 * that iOS suspends, drops a request that long, and supabase-js reports the
 * drop as "Failed to send a request to the Edge Function". The server never
 * notices: it finishes the analysis and the result lands in the database
 * while the user is looking at that error on the form.
 *
 * So the client no longer treats the response as the signal that the check
 * started. It fires the request and, in parallel, watches the check row.
 * The server flips the row from 'draft' to 'processing' inside the first
 * second (reserve_check_analysis), and that flip is the real "accepted"
 * signal. Whichever arrives first wins, and the results page takes over
 * from there by polling for the outcome.
 *
 * Pure so it can be tested without a Supabase client: everything that does
 * I/O is injected.
 */

export type AnalysisInvokeOutcome =
  /** The function answered 2xx: the analysis ran to completion. */
  | { kind: 'accepted' }
  /** fetch rejected: the request produced no response at all. */
  | { kind: 'transport-failure' }
  /** 409: the check is already processing or already completed. */
  | { kind: 'already-started' }
  /** Any other failure, with the user facing message already resolved. */
  | { kind: 'rejected'; error: Error }

export interface StartAnalysisDeps {
  invoke: () => Promise<AnalysisInvokeOutcome>
  /** Current `checks.status` for the row, or null if it cannot be read. */
  getStatus: () => Promise<string | null>
  sleep: (ms: number) => Promise<void>
  pollIntervalMs?: number
  maxWaitMs?: number
}

export const CONNECTION_DROPPED_MESSAGE =
  'The connection dropped before your check could start. Check your signal and try again.'

export const ANALYSIS_START_POLL_MS = 1000
// The row flips to 'processing' within a second or two of the request
// arriving. If it has not moved in this long the request is not going to
// arrive, whatever the still pending fetch believes.
export const ANALYSIS_START_MAX_WAIT_MS = 90_000

export async function startAnalysis(deps: StartAnalysisDeps): Promise<void> {
  const pollIntervalMs = deps.pollIntervalMs ?? ANALYSIS_START_POLL_MS
  const maxWaitMs = deps.maxWaitMs ?? ANALYSIS_START_MAX_WAIT_MS

  // Held in an object rather than a bare `let` so the assignment from inside
  // the promise callback is visible to the loop below without TypeScript
  // narrowing the variable to its initial null.
  const state: { outcome: AnalysisInvokeOutcome | null } = { outcome: null }
  void deps.invoke().then(
    (outcome) => {
      state.outcome = outcome
    },
    (error: unknown) => {
      state.outcome = {
        kind: 'rejected',
        error: error instanceof Error ? error : new Error('Something went wrong'),
      }
    },
  )

  let waitedMs = 0
  for (;;) {
    const outcome = state.outcome
    if (outcome) {
      if (outcome.kind === 'accepted' || outcome.kind === 'already-started') return
      if (outcome.kind === 'rejected') throw outcome.error
      // Transport failure. The request may well have reached the server
      // before the connection died, so ask the database rather than assume.
      if (await hasLeftDraft(deps)) return
      throw new Error(CONNECTION_DROPPED_MESSAGE)
    }

    if (waitedMs >= maxWaitMs) throw new Error(CONNECTION_DROPPED_MESSAGE)
    await deps.sleep(pollIntervalMs)
    waitedMs += pollIntervalMs

    // A settled request is a more precise answer than a status poll, and a
    // rejection must not be masked by a status read that happens to succeed.
    if (state.outcome) continue
    if (await hasLeftDraft(deps)) return
  }
}

async function hasLeftDraft(deps: StartAnalysisDeps): Promise<boolean> {
  try {
    const status = await deps.getStatus()
    return status !== null && status !== 'draft'
  } catch {
    // An unreadable status is not evidence either way; keep waiting.
    return false
  }
}
