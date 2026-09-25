// Run with: npx tsx src/lib/evidenceFollowUp.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  answerProblem,
  canSubmitAnswer,
  copiesFollowUpExample,
  createSubmissionGuard,
  FOLLOW_UP_EXAMPLE,
  FOLLOW_UP_EXAMPLE_COPY_MESSAGE,
  FOLLOW_UP_OPTIONAL_NOTE,
  FOLLOW_UP_POLL_MAX_MS,
  FOLLOW_UP_UNCONFIRMED_MESSAGE,
  MAX_ANSWER_CHARS,
  resolveFollowUpOutcome,
  resolveEffectiveResult,
  isFollowUpEligibleScore,
  FOLLOW_UP_MIN_SCORE,
  FOLLOW_UP_MAX_SCORE,
  UPDATED_REPORT_NOTE,
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

await test('the copy says the answer is optional, cannot lower the score, and labels a reported answer', () => {
  assert.equal(FOLLOW_UP_OPTIONAL_NOTE, 'Optional. Your score can only go up or stay the same.')
  assert.match(CANDIDATE_REPORTED_LABEL, /not on your CV/)
  assert.match(UPDATED_REPORT_NOTE, /not on your CV/)
})

await test('the copy has no dashes', () => {
  for (const text of [
    FOLLOW_UP_OPTIONAL_NOTE,
    FOLLOW_UP_HEADING,
    FOLLOW_UP_WORKING_MESSAGE,
    FOLLOW_UP_EXAMPLE,
    FOLLOW_UP_EXAMPLE_COPY_MESSAGE,
    CANDIDATE_REPORTED_LABEL,
    UPDATED_REPORT_NOTE,
  ]) {
    assert.doesNotMatch(text, /[-–—]/, text)
  }
})

await test('the example is the one the founder gave: situation, action, outcome and a figure', () => {
  assert.equal(
    FOLLOW_UP_EXAMPLE,
    'Users were dropping off during onboarding. I simplified the signup process, increasing completion from 62% to 78%.',
  )
})

await test('the card is a title, one short line, one example and the answer box, and names no requirement', () => {
  const card = readFileSync('src/components/feedback/EvidenceFollowUpCard.tsx', 'utf8')
  const pending = card.slice(card.indexOf('Unanswered, and the original CV is gone'))
  const order = ['{FOLLOW_UP_HEADING}', '{followUp.question}', 'Example:', '{FOLLOW_UP_EXAMPLE}', '<Textarea']
  const positions = order.map((marker) => pending.indexOf(marker))
  assert.ok(positions.every((position) => position > 0), `all present: ${order.join(', ')}`)
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'in this order')
  // Gap Analysis above names the requirement; the card never repeats it or the gap.
  for (const repeated of [/gap_requirement/, /gap_summary/, /About this requirement/]) {
    assert.doesNotMatch(card, repeated)
  }
})

await test('the example is guidance only: never submitted, only the candidate typed answer is', () => {
  const card = readFileSync('src/components/feedback/EvidenceFollowUpCard.tsx', 'utf8')
  assert.match(card, /submitEvidenceFollowUp\(followUp\.check_id, answer\.trim\(\)\)/)
  assert.equal(card.match(/FOLLOW_UP_EXAMPLE/g)?.length, 2, 'imported and rendered, used nowhere else')
  assert.doesNotMatch(card, /placeholder=/, 'never prefilled into the answer box')
})

await test('an answer that copies the example is refused, and a genuine one is not', () => {
  const copies = [
    FOLLOW_UP_EXAMPLE,
    'Users were dropping off during onboarding. I simplified the signup process, increasing completion from 40% to 55%.',
    'Users dropped off during onboarding, so I simplified signup and completion went from 62% to 78%.',
    `At my last job: ${FOLLOW_UP_EXAMPLE}`,
  ]
  for (const draft of copies) {
    assert.equal(answerProblem(draft), FOLLOW_UP_EXAMPLE_COPY_MESSAGE, draft)
    assert.equal(canSubmitAnswer(draft), false, draft)
    assert.equal(copiesFollowUpExample(draft), true, draft)
  }
  const genuine = [
    GOOD,
    'At Brightwell our trial users stalled in onboarding, so I cut the setup to 2 screens and trial conversion rose by 30%.',
    'I grew weekly active users from 62 to 78 by sending a reminder email to people who had not logged in.',
  ]
  for (const draft of genuine) {
    assert.equal(answerProblem(draft), null, draft)
    assert.equal(copiesFollowUpExample(draft), false, draft)
  }
})

// ---------------------------------------------------------------------------
// One score
// ---------------------------------------------------------------------------

const BASE = {
  score: 72,
  strengths: ['s0'],
  improvements: ['i0'],
  prospects: ['p0'],
  requirementEvidence: [],
  recruiterDoubts: [],
}
const ASSESSED = {
  status: 'assessed',
  final_score: 78,
  final_strengths: ['s1'],
  final_improvements: ['i1'],
  final_prospects: ['p1'],
  final_requirement_evidence: [
    { requirement: 'R1', importance: 'must_have', evidence_strength: 'strong', evidence_found: 'e1', recruiter_interpretation: 'ri1', gap_note: null },
  ],
  final_recruiter_doubts: ['d1'],
}

await test('only Needs Improvement, 61 to 84, is eligible', () => {
  assert.equal(FOLLOW_UP_MIN_SCORE, 61)
  assert.equal(FOLLOW_UP_MAX_SCORE, 84)
  for (const [score, expected] of [[60, false], [61, true], [72, true], [84, true], [85, false], [100, false]] as const) {
    assert.equal(isFollowUpEligibleScore(score), expected, String(score))
  }
  assert.equal(isFollowUpEligibleScore(null), false)
  assert.equal(isFollowUpEligibleScore('72'), false)
  assert.equal(isFollowUpEligibleScore(Number.NaN), false)
})

await test('an assessed, higher follow up replaces the score and the findings together', () => {
  const result = resolveEffectiveResult(BASE, ASSESSED)
  assert.deepEqual(result, {
    score: 78,
    strengths: ['s1'],
    improvements: ['i1'],
    prospects: ['p1'],
    requirementEvidence: ASSESSED.final_requirement_evidence,
    recruiterDoubts: ['d1'],
    updated: true,
  })
})

await test('the original score is not present anywhere in an updated result', () => {
  assert.doesNotMatch(JSON.stringify(resolveEffectiveResult(BASE, ASSESSED)), /72/)
})

await test('anything short of an assessed, strictly higher, complete follow up leaves the original', () => {
  const untouched = { ...BASE, updated: false }
  for (const followUp of [
    null,
    undefined,
    { ...ASSESSED, status: 'pending' },
    { ...ASSESSED, status: 'processing' },
    { ...ASSESSED, final_score: 72 },
    { ...ASSESSED, final_score: 60 },
    { ...ASSESSED, final_score: 101 },
    { ...ASSESSED, final_score: 78.5 },
    { ...ASSESSED, final_score: null },
    { ...ASSESSED, final_strengths: null },
    { ...ASSESSED, final_improvements: null },
    { ...ASSESSED, final_prospects: [1] as unknown as string[] },
  ]) {
    assert.deepEqual(resolveEffectiveResult(BASE, followUp), untouched, JSON.stringify(followUp))
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
