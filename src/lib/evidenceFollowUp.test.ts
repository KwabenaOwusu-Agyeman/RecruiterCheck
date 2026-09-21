// Run with: npx tsx src/lib/evidenceFollowUp.test.ts
import assert from 'node:assert/strict'
import {
  answerProblem,
  canSubmitAnswer,
  createSubmissionGuard,
  FOLLOW_UP_INTEGRITY_NOTE,
  FOLLOW_UP_OPTIONAL_NOTE,
  FOLLOW_UP_POLL_MAX_MS,
  FOLLOW_UP_UNCONFIRMED_MESSAGE,
  MAX_ANSWER_CHARS,
  resolveFollowUpOutcome,
  FINAL_SCORE_LABEL,
  INITIAL_SCORE_LABEL,
  CANDIDATE_REPORTED_LABEL,
  FOLLOW_UP_HEADING,
  FOLLOW_UP_WORKING_MESSAGE,
} from './evidenceFollowUp'

let passed = 0
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    passed += 1
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`FAIL - ${name}`)
    throw error
  }
}

const GOOD = 'I built a churn prediction model in Python with pandas and scikit-learn for a university project.'

await test('an empty box is not an error, but cannot be submitted', () => {
  assert.equal(answerProblem(''), null)
  assert.equal(canSubmitAnswer(''), false)
  assert.equal(canSubmitAnswer('   '), false)
})

await test('a bare claim or a one liner cannot be submitted', () => {
  for (const draft of ['Yes', "I'm very good at Python", 'yes I have experience with that', 'a'.repeat(60)]) {
    assert.equal(canSubmitAnswer(draft), false, draft)
    assert.ok(answerProblem(draft))
  }
})

await test('a specific answer can be submitted', () => {
  assert.equal(answerProblem(GOOD), null)
  assert.equal(canSubmitAnswer(GOOD), true)
})

await test('an over long answer is refused', () => {
  assert.ok(answerProblem('word '.repeat(MAX_ANSWER_CHARS)))
})

await test('the copy never invites invention and carries the integrity note', () => {
  assert.match(FOLLOW_UP_INTEGRITY_NOTE, /genuinely true/)
  assert.match(FOLLOW_UP_INTEGRITY_NOTE, /self reported/)
  assert.match(FOLLOW_UP_INTEGRITY_NOTE, /does not change your score unless it is specific and relevant/)
  assert.match(FOLLOW_UP_OPTIONAL_NOTE, /Optional/)
  assert.match(CANDIDATE_REPORTED_LABEL, /not on your CV/)
})

await test('the score labels distinguish initial from final and use no dashes', () => {
  assert.equal(INITIAL_SCORE_LABEL, 'Initial Recruiter Score')
  assert.equal(FINAL_SCORE_LABEL, 'Final Recruiter Score')
  for (const text of [
    FOLLOW_UP_INTEGRITY_NOTE,
    FOLLOW_UP_OPTIONAL_NOTE,
    FOLLOW_UP_HEADING,
    FOLLOW_UP_WORKING_MESSAGE,
    CANDIDATE_REPORTED_LABEL,
    INITIAL_SCORE_LABEL,
    FINAL_SCORE_LABEL,
  ]) {
    assert.doesNotMatch(text, /[-–—]/, text)
  }
})

// ---------------------------------------------------------------------------
// Duplicate submissions
// ---------------------------------------------------------------------------

await test('two submissions in the same frame make exactly one call', async () => {
  const run = createSubmissionGuard()
  let calls = 0
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  const work = async () => {
    calls += 1
    await gate
    return 'assessed'
  }
  const first = run(work)
  const second = run(work)
  assert.deepEqual(await second, { status: 'busy' })
  release()
  assert.deepEqual(await first, { status: 'ok', value: 'assessed' })
  assert.equal(calls, 1)
})

await test('a failure is returned with its message, releases the guard, and a retry works', async () => {
  const run = createSubmissionGuard()
  const failed = await run(async () => {
    throw new Error('Could not update your Recruiter Check. Your original result is unchanged. Please try again.')
  })
  assert.equal(failed.status, 'error')
  if (failed.status === 'error') assert.match(failed.message, /original result is unchanged/)
  assert.deepEqual(await run(async () => 'ok'), { status: 'ok', value: 'ok' })
})

await test('an error with no message still says the original result is unchanged', async () => {
  const run = createSubmissionGuard()
  const failed = await run(async () => {
    throw new Error('')
  })
  assert.equal(failed.status, 'error')
  if (failed.status === 'error') assert.match(failed.message, /original result is unchanged/)
})

// ---------------------------------------------------------------------------
// Outcome after the request returns
// ---------------------------------------------------------------------------

function clock() {
  let t = 0
  return { now: () => t, sleep: async (ms: number) => void (t += ms) }
}

await test('an accepted response returns the assessed row without waiting or re-analysing', async () => {
  const { now, sleep } = clock()
  let reads = 0
  const row = { status: 'assessed', final_score: 78 }
  const result = await resolveFollowUpOutcome({ accepted: true, getFollowUp: async () => (reads++, row), sleep, now })
  assert.equal(result, row)
  assert.equal(reads, 1)
})

await test('an accepted response that is not assessed is a failure, not a wait', async () => {
  const { now, sleep } = clock()
  await assert.rejects(
    resolveFollowUpOutcome({ accepted: true, getFollowUp: async () => ({ status: 'pending' }), sleep, now }),
    { message: FOLLOW_UP_UNCONFIRMED_MESSAGE },
  )
})

await test('a dropped connection waits for the server to finish, then returns the result', async () => {
  const { now, sleep } = clock()
  const states = ['processing', 'processing', 'assessed']
  let i = 0
  const result = await resolveFollowUpOutcome({
    accepted: false,
    getFollowUp: async () => ({ status: states[Math.min(i++, states.length - 1)] }),
    sleep,
    now,
  })
  assert.equal(result.status, 'assessed')
  assert.equal(i, 3)
})

await test('a dropped connection that left the row pending fails at once: nothing more is coming', async () => {
  const { now, sleep } = clock()
  let reads = 0
  await assert.rejects(
    resolveFollowUpOutcome({ accepted: false, getFollowUp: async () => (reads++, { status: 'pending' }), sleep, now }),
    { message: FOLLOW_UP_UNCONFIRMED_MESSAGE },
  )
  assert.equal(reads, 1)
})

await test('waiting is bounded', async () => {
  const { now, sleep } = clock()
  let reads = 0
  await assert.rejects(
    resolveFollowUpOutcome({ accepted: false, getFollowUp: async () => (reads++, { status: 'processing' }), sleep, now }),
    { message: FOLLOW_UP_UNCONFIRMED_MESSAGE },
  )
  assert.ok(now() > FOLLOW_UP_POLL_MAX_MS)
  assert.ok(reads < 100)
})

console.log(`\n${passed} tests passed`)
