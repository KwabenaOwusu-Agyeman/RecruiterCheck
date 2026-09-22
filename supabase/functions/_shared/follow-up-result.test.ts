// Run with: npx tsx supabase/functions/_shared/follow-up-result.test.ts
//
// The rules that make a report show ONE score after an Evidence Follow Up:
// who is eligible, the floor that stops the score falling, and when a follow
// up replaces the original. Also pins the browser mirror to this module and
// the band to the document entitlement bands. No model, network or data.
import assert from 'node:assert/strict'
import {
  applyFollowUpFloor,
  FOLLOW_UP_MAX_SCORE,
  FOLLOW_UP_MIN_SCORE,
  isFollowUpEligibleScore,
  resolveEffectiveResult,
  type StoredFollowUp,
} from './follow-up-result.ts'
import {
  FOLLOW_UP_MAX_SCORE as CLIENT_MAX,
  FOLLOW_UP_MIN_SCORE as CLIENT_MIN,
  isFollowUpEligibleScore as clientEligible,
  resolveEffectiveResult as clientResolve,
} from '../../../src/lib/evidenceFollowUp.ts'
import {
  LIKELY_INTERVIEW_CANDIDATE_MIN_SCORE,
  NOT_A_FIT_MAX_SCORE,
} from '../../../src/lib/documentEntitlement.ts'
import { getScoreLabel } from '../../../src/lib/scoring.ts'

let passed = 0
function test(name: string, fn: () => void) {
  try {
    fn()
    passed += 1
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`FAIL - ${name}`)
    throw error
  }
}

test('the follow up band is exactly the Needs Improvement band', () => {
  assert.equal(FOLLOW_UP_MIN_SCORE, NOT_A_FIT_MAX_SCORE + 1)
  assert.equal(FOLLOW_UP_MAX_SCORE, LIKELY_INTERVIEW_CANDIDATE_MIN_SCORE - 1)
  for (let score = 0; score <= 100; score += 1) {
    assert.equal(isFollowUpEligibleScore(score), getScoreLabel(score) === 'Needs Improvement', `score ${score}`)
  }
})

test('non numbers are never eligible', () => {
  for (const value of [null, undefined, '72', Number.NaN, Number.POSITIVE_INFINITY, {}, []]) {
    assert.equal(isFollowUpEligibleScore(value), false)
  }
})

test('the floor: a higher reassessment replaces the score, anything else keeps the original', () => {
  assert.deepEqual(applyFollowUpFloor(72, 78), { score: 78, improved: true })
  assert.deepEqual(applyFollowUpFloor(72, 72), { score: 72, improved: false })
  assert.deepEqual(applyFollowUpFloor(72, 65), { score: 72, improved: false })
  assert.deepEqual(applyFollowUpFloor(72, 0), { score: 72, improved: false })
})

test('the score can never fall, for every pair of scores', () => {
  for (let initial = 0; initial <= 100; initial += 5) {
    for (let reassessed = 0; reassessed <= 100; reassessed += 5) {
      const outcome = applyFollowUpFloor(initial, reassessed)
      assert.ok(outcome.score >= initial)
      assert.equal(outcome.score, Math.max(initial, reassessed))
      assert.equal(outcome.improved, reassessed > initial)
    }
  }
})

const BASE = { score: 72, strengths: ['s0'], improvements: ['i0'], prospects: ['p0'] }
const ASSESSED: StoredFollowUp = {
  status: 'assessed',
  final_score: 78,
  final_strengths: ['s1'],
  final_improvements: ['i1'],
  final_prospects: ['p1'],
}

test('a higher assessed follow up replaces score and findings together, and nothing of the original survives', () => {
  const result = resolveEffectiveResult(BASE, ASSESSED)
  assert.deepEqual(result, { score: 78, strengths: ['s1'], improvements: ['i1'], prospects: ['p1'], updated: true })
  assert.doesNotMatch(JSON.stringify(result), /72|s0|i0|p0/)
})

const NOT_REPLACING: Array<[string, StoredFollowUp | null | undefined]> = [
  ['no follow up', null],
  ['undefined', undefined],
  ['pending', { ...ASSESSED, status: 'pending' }],
  ['processing', { ...ASSESSED, status: 'processing' }],
  ['same score', { ...ASSESSED, final_score: 72 }],
  ['lower score', { ...ASSESSED, final_score: 60 }],
  ['above 100', { ...ASSESSED, final_score: 101 }],
  ['fractional', { ...ASSESSED, final_score: 78.5 }],
  ['no score', { ...ASSESSED, final_score: null }],
  ['no strengths', { ...ASSESSED, final_strengths: null }],
  ['no improvements', { ...ASSESSED, final_improvements: null }],
  ['no prospects', { ...ASSESSED, final_prospects: null }],
  ['malformed list', { ...ASSESSED, final_prospects: [1] as unknown as string[] }],
]

test('anything short of an assessed, strictly higher, complete follow up leaves the original', () => {
  for (const [name, followUp] of NOT_REPLACING) {
    assert.deepEqual(resolveEffectiveResult(BASE, followUp), { ...BASE, updated: false }, name)
  }
})

test('the browser and the functions agree on every case', () => {
  assert.equal(CLIENT_MIN, FOLLOW_UP_MIN_SCORE)
  assert.equal(CLIENT_MAX, FOLLOW_UP_MAX_SCORE)
  for (let score = 0; score <= 100; score += 1) assert.equal(clientEligible(score), isFollowUpEligibleScore(score))
  for (const value of [null, undefined, '72', Number.NaN]) assert.equal(clientEligible(value), isFollowUpEligibleScore(value))
  const cases: Array<StoredFollowUp | null | undefined> = [ASSESSED, ...NOT_REPLACING.map(([, followUp]) => followUp)]
  for (const followUp of cases) {
    assert.deepEqual(clientResolve(BASE, followUp), resolveEffectiveResult(BASE, followUp), JSON.stringify(followUp))
  }
})

console.log(`\n${passed} tests passed`)
