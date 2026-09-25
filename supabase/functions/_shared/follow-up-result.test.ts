// Run with: npx tsx supabase/functions/_shared/follow-up-result.test.ts
//
// The rules that make a report show ONE score after an Evidence Follow Up:
// who is eligible, the floor that stops the score falling, and when a follow
// up replaces the original. Also pins the browser mirror to this module and
// the band to the document entitlement bands. No model, network or data.
import assert from 'node:assert/strict'
import {
  applyFollowUpScoreLimits,
  FOLLOW_UP_MAX_SCORE,
  FOLLOW_UP_MIN_SCORE,
  isFollowUpEligibleScore,
  isMeaningfulFollowUpEvidence,
  MAX_FOLLOW_UP_GAIN,
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

test('score protection: the brief\'s four cases', () => {
  assert.equal(MAX_FOLLOW_UP_GAIN, 3)
  assert.deepEqual(applyFollowUpScoreLimits(72, 74, true), { score: 74, improved: true })
  assert.deepEqual(applyFollowUpScoreLimits(72, 80, true), { score: 75, improved: true })
  assert.deepEqual(applyFollowUpScoreLimits(72, 71, true), { score: 72, improved: false })
  assert.deepEqual(applyFollowUpScoreLimits(72, 80, false), { score: 72, improved: false })
})

test('an equal or lower reassessment keeps the original, meaningful or not', () => {
  for (const meaningful of [true, false]) {
    assert.deepEqual(applyFollowUpScoreLimits(72, 72, meaningful), { score: 72, improved: false })
    assert.deepEqual(applyFollowUpScoreLimits(72, 0, meaningful), { score: 72, improved: false })
  }
})

test('for every pair of scores: never falls, never rises more than 3, never moves without meaningful evidence', () => {
  for (let initial = 0; initial <= 100; initial += 1) {
    for (let reassessed = 0; reassessed <= 100; reassessed += 1) {
      const outcome = applyFollowUpScoreLimits(initial, reassessed, true)
      assert.equal(outcome.score, Math.min(Math.max(initial, reassessed), initial + MAX_FOLLOW_UP_GAIN))
      assert.ok(outcome.score >= initial && outcome.score <= initial + MAX_FOLLOW_UP_GAIN)
      assert.equal(outcome.improved, outcome.score > initial)
      assert.deepEqual(applyFollowUpScoreLimits(initial, reassessed, false), { score: initial, improved: false })
    }
  }
})

test('skipping the question leaves the original result, on the server and in the browser', () => {
  const skipped: StoredFollowUp = { status: 'pending', final_score: null }
  for (const resolve of [resolveEffectiveResult, clientResolve]) {
    const result = resolve({ score: 72, strengths: ['s0'], improvements: ['i0'], prospects: ['p0'], requirementEvidence: [], recruiterDoubts: [] }, skipped)
    assert.equal(result.score, 72)
    assert.equal(result.updated, false)
  }
})

test('meaningful evidence needs relevance, situation, action, outcome, newness and credibility, but never a number', () => {
  const all = {
    addresses_requirement: true,
    situation: true,
    action: true,
    outcome: true,
    measurable_result: true,
    new_information: true,
    credible: true,
  }
  assert.equal(isMeaningfulFollowUpEvidence(all), true)
  assert.equal(isMeaningfulFollowUpEvidence({ ...all, measurable_result: false }), true)
  for (const key of ['addresses_requirement', 'situation', 'action', 'outcome', 'new_information', 'credible'] as const) {
    assert.equal(isMeaningfulFollowUpEvidence({ ...all, [key]: false }), false, key)
  }
  assert.equal(isMeaningfulFollowUpEvidence(null), false)
  assert.equal(isMeaningfulFollowUpEvidence(undefined), false)
})

const BASE = {
  score: 72,
  strengths: ['s0'],
  improvements: ['i0'],
  prospects: ['p0'],
  requirementEvidence: [],
  recruiterDoubts: [],
}
const ASSESSED: StoredFollowUp = {
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

test('a higher assessed follow up replaces score and findings together, and nothing of the original survives', () => {
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
  assert.doesNotMatch(JSON.stringify(result), /72|s0|i0|p0/)
})

test('malformed new fields default safely to empty arrays without blocking the score/findings replacement', () => {
  const malformed = resolveEffectiveResult(BASE, {
    ...ASSESSED,
    final_requirement_evidence: 'not an array',
    final_recruiter_doubts: [1, 2] as unknown as string[],
  })
  assert.equal(malformed.score, 78)
  assert.deepEqual(malformed.strengths, ['s1'])
  assert.deepEqual(malformed.requirementEvidence, [])
  assert.deepEqual(malformed.recruiterDoubts, [])
  assert.equal(malformed.updated, true)
})

test('missing new fields (a follow up written before this migration) default safely too', () => {
  const withoutNewFields: StoredFollowUp = {
    status: ASSESSED.status,
    final_score: ASSESSED.final_score,
    final_strengths: ASSESSED.final_strengths,
    final_improvements: ASSESSED.final_improvements,
    final_prospects: ASSESSED.final_prospects,
  }
  const result = resolveEffectiveResult(BASE, withoutNewFields)
  assert.deepEqual(result.requirementEvidence, [])
  assert.deepEqual(result.recruiterDoubts, [])
  assert.equal(result.updated, true)
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
