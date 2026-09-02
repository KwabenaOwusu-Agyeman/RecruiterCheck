// Run with: npx tsx src/lib/analysisStart.test.ts
import assert from 'node:assert/strict'
import {
  ANALYSIS_START_MAX_WAIT_MS,
  ANALYSIS_START_POLL_MS,
  CONNECTION_DROPPED_MESSAGE,
  startAnalysis,
  type AnalysisInvokeOutcome,
  type StartAnalysisDeps,
} from './analysisStart'

let passed = 0
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    passed += 1
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`FAIL - ${name}`)
    throw error
  }
}

const never = () => new Promise<never>(() => {})
const immediately = <T,>(value: T) => () => Promise.resolve(value)

/** Yields to the microtask queue without any real waiting. */
const instantSleep = () => Promise.resolve()

/** A getStatus that answers each call from the list, repeating the last. */
function statusSequence(statuses: Array<string | null>) {
  let calls = 0
  const getStatus = () => {
    const status = statuses[Math.min(calls, statuses.length - 1)]
    calls += 1
    return Promise.resolve(status)
  }
  return { getStatus, calls: () => calls }
}

function deps(overrides: Partial<StartAnalysisDeps>): StartAnalysisDeps {
  return {
    invoke: never,
    getStatus: immediately<string | null>('draft'),
    sleep: instantSleep,
    pollIntervalMs: 10,
    maxWaitMs: 100,
    ...overrides,
  }
}

async function rejectsWith(promise: Promise<unknown>, message: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.equal(error.message, message)
    return true
  })
}

async function run() {
  // -------------------------------------------------------------------------
  // The request settling is the primary signal.
  // -------------------------------------------------------------------------

  await test('resolves when the function answers 2xx', async () => {
    const status = statusSequence(['draft'])
    await startAnalysis(deps({ invoke: immediately<AnalysisInvokeOutcome>({ kind: 'accepted' }), getStatus: status.getStatus }))
  })

  await test('resolves on 409 already started, without consulting the row', async () => {
    const status = statusSequence(['draft'])
    await startAnalysis(
      deps({ invoke: immediately<AnalysisInvokeOutcome>({ kind: 'already-started' }), getStatus: status.getStatus }),
    )
    assert.equal(status.calls(), 0)
  })

  await test('rethrows a real server rejection with its resolved message', async () => {
    const error = new Error('You have used your 1 free Recruiter Check. Upgrade to continue.')
    await rejectsWith(
      startAnalysis(deps({ invoke: immediately<AnalysisInvokeOutcome>({ kind: 'rejected', error }) })),
      error.message,
    )
  })

  await test('a rejection is not masked by a status poll that happens to succeed', async () => {
    // Both arrive in the same tick: the rejection was set by the invoke
    // callback and the row (say, from a previous attempt) reads as failed.
    const error = new Error('Could not read text from this CV file')
    await rejectsWith(
      startAnalysis(
        deps({
          invoke: immediately<AnalysisInvokeOutcome>({ kind: 'rejected', error }),
          getStatus: immediately<string | null>('failed'),
        }),
      ),
      error.message,
    )
  })

  await test('wraps a non-Error rejection in a generic message', async () => {
    await rejectsWith(
      startAnalysis(deps({ invoke: () => Promise.reject('boom') })),
      'Something went wrong',
    )
  })

  // -------------------------------------------------------------------------
  // The row leaving 'draft' is the second signal, for the long request case.
  // -------------------------------------------------------------------------

  await test('resolves as soon as the row flips to processing while the request is still open', async () => {
    const status = statusSequence(['draft', 'draft', 'processing'])
    let sleeps = 0
    await startAnalysis(
      deps({
        invoke: never,
        getStatus: status.getStatus,
        sleep: () => {
          sleeps += 1
          return instantSleep()
        },
      }),
    )
    assert.equal(status.calls(), 3)
    assert.equal(sleeps, 3)
  })

  await test('a completed row also counts as started', async () => {
    await startAnalysis(deps({ invoke: never, getStatus: immediately<string | null>('completed') }))
  })

  await test('an unreadable row is not evidence and does not abort the wait', async () => {
    let calls = 0
    const getStatus = () => {
      calls += 1
      return calls < 3 ? Promise.reject(new Error('network')) : Promise.resolve('processing')
    }
    await startAnalysis(deps({ invoke: never, getStatus }))
    assert.equal(calls, 3)
  })

  await test('gives up with the connection message once the row has stayed draft past the deadline', async () => {
    let sleeps = 0
    await rejectsWith(
      startAnalysis(
        deps({
          invoke: never,
          pollIntervalMs: 10,
          maxWaitMs: 30,
          sleep: () => {
            sleeps += 1
            return instantSleep()
          },
        }),
      ),
      CONNECTION_DROPPED_MESSAGE,
    )
    assert.equal(sleeps, 3)
  })

  // -------------------------------------------------------------------------
  // Transport failure: the request produced no response, so the row decides.
  // -------------------------------------------------------------------------

  await test('a dropped connection after the server accepted the check resolves', async () => {
    await startAnalysis(
      deps({
        invoke: immediately<AnalysisInvokeOutcome>({ kind: 'transport-failure' }),
        getStatus: immediately<string | null>('processing'),
      }),
    )
  })

  await test('a dropped connection that never reached the server throws the connection message', async () => {
    await rejectsWith(
      startAnalysis(
        deps({
          invoke: immediately<AnalysisInvokeOutcome>({ kind: 'transport-failure' }),
          getStatus: immediately<string | null>('draft'),
        }),
      ),
      CONNECTION_DROPPED_MESSAGE,
    )
  })

  await test('a dropped connection with an unreadable row throws the connection message', async () => {
    await rejectsWith(
      startAnalysis(
        deps({
          invoke: immediately<AnalysisInvokeOutcome>({ kind: 'transport-failure' }),
          getStatus: () => Promise.reject(new Error('network')),
        }),
      ),
      CONNECTION_DROPPED_MESSAGE,
    )
  })

  // -------------------------------------------------------------------------
  // Copy and defaults.
  // -------------------------------------------------------------------------

  await test('the connection message carries no dashes and never mentions the Edge Function', async () => {
    assert.ok(!/[-–—]/.test(CONNECTION_DROPPED_MESSAGE))
    assert.ok(!/edge function/i.test(CONNECTION_DROPPED_MESSAGE))
  })

  await test('the default deadline is well inside the 10 minute staleness window', async () => {
    assert.ok(ANALYSIS_START_POLL_MS >= 500)
    assert.ok(ANALYSIS_START_MAX_WAIT_MS < 10 * 60 * 1000)
  })

  console.log(`\n${passed} tests passed`)
}

void run()
