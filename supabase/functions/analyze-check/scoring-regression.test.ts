// Run with: npx tsx supabase/functions/analyze-check/scoring-regression.test.ts
//
// Drives the synthetic corpus in fixtures/synthetic/ through the real
// deterministic scoring functions in logic.ts and asserts the score and the
// displayed label for each case.
//
// This changes no scoring behaviour. It reproduces the published composition
//   0.4 * category1 + 0.35 * category2 + 0.25 * category3, then the critical
//   gap cap
// exactly as index.ts assembles it, so a change to any weight, any level
// value, the band thresholds, or the cap surfaces here as a named failure
// rather than as a silent shift in what candidates are told.
//
// No model call, no network, no API key, no candidate data.
import assert from 'node:assert/strict'
import {
  calculateEvidenceAbilityScore,
  calculateCapabilityScore,
  calculateFitCommunicationScore,
  applyCriticalGapCap,
  blendCategoryScores,
  CATEGORY_BLEND_WEIGHTS,
} from './logic.ts'
import { getScoreLabel } from '../../../src/lib/scoring.ts'
import { SYNTHETIC_CASES, type SyntheticCase } from '../../../fixtures/synthetic/candidates.ts'

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

// Every part of the pipeline below is imported from logic.ts, including the
// final category blend, so nothing here restates a weight. A change to any
// weight, level value, threshold or the cap fails these cases directly.
function scoreCase(c: SyntheticCase) {
  const category1 = calculateEvidenceAbilityScore(c.evidenceAbility)
  const category2 = calculateCapabilityScore(c.requirements, c.capability)
  const category3 = calculateFitCommunicationScore(c.fitCommunication)
  const raw = blendCategoryScores(category1, category2, category3)
  const final = applyCriticalGapCap(raw, c.requirements)
  return { category1, category2, category3, raw, final }
}

// ---------------------------------------------------------------------------
// Per-case regression
// ---------------------------------------------------------------------------

for (const c of SYNTHETIC_CASES) {
  test(`${c.id} (${c.profile}) scores ${c.expectedScore}`, () => {
    const { final } = scoreCase(c)
    assert.equal(
      final,
      c.expectedScore,
      `${c.id}: expected ${c.expectedScore}, got ${final}. ${c.note}`,
    )
  })

  test(`${c.id} is labelled "${c.expectedLabel}"`, () => {
    const { final } = scoreCase(c)
    assert.equal(getScoreLabel(final), c.expectedLabel)
  })
}

// ---------------------------------------------------------------------------
// Corpus-level invariants
// ---------------------------------------------------------------------------

test('every score is an integer within 0 to 100', () => {
  for (const c of SYNTHETIC_CASES) {
    const { final } = scoreCase(c)
    assert.ok(Number.isInteger(final), `${c.id} produced a non-integer`)
    assert.ok(final >= 0 && final <= 100, `${c.id} produced ${final}`)
  }
})

test('the corpus covers all four disciplines', () => {
  const seen = new Set(SYNTHETIC_CASES.map((c) => c.discipline))
  for (const d of ['ai', 'machine-learning', 'data', 'software']) {
    assert.ok(seen.has(d as SyntheticCase['discipline']), `no fixture for ${d}`)
  }
})

test('the corpus spans all three score bands', () => {
  const labels = new Set(SYNTHETIC_CASES.map((c) => getScoreLabel(c.expectedScore)))
  for (const l of ['Likely Interview Candidate', 'Needs Improvement', 'Not a Fit']) {
    assert.ok(labels.has(l), `no fixture lands in "${l}"`)
  }
})

test('the strong match outranks the weak match by a wide margin', () => {
  const strong = SYNTHETIC_CASES.find((c) => c.id === 'ai-strong-match')!
  const weak = SYNTHETIC_CASES.find((c) => c.id === 'data-weak-match')!
  assert.ok(
    scoreCase(strong).final - scoreCase(weak).final > 50,
    'ordering between a strong and a weak candidate collapsed',
  )
})

test('the critical gap cap binds, and only where a critical must-have is unmatched', () => {
  const capped = SYNTHETIC_CASES.find((c) => c.id === 'data-critical-gap-capped')!
  const { raw, final } = scoreCase(capped)
  assert.ok(raw >= 85, `expected a strong raw score before the cap, got ${raw}`)
  assert.equal(final, 49, 'the cap no longer binds')

  for (const c of SYNTHETIC_CASES.filter((x) => x.id !== 'data-critical-gap-capped')) {
    const s = scoreCase(c)
    assert.equal(s.final, s.raw, `${c.id} was capped but has no critical gap`)
  }
})

test('the published category weights are 40 / 35 / 25 and sum to 1', () => {
  assert.equal(CATEGORY_BLEND_WEIGHTS.evidenceAndAppliedAbility, 0.4)
  assert.equal(CATEGORY_BLEND_WEIGHTS.technicalCapability, 0.35)
  assert.equal(CATEGORY_BLEND_WEIGHTS.fitAndCommunication, 0.25)
  const sum =
    CATEGORY_BLEND_WEIGHTS.evidenceAndAppliedAbility +
    CATEGORY_BLEND_WEIGHTS.technicalCapability +
    CATEGORY_BLEND_WEIGHTS.fitAndCommunication
  assert.ok(Math.abs(sum - 1) < 1e-9, `category weights sum to ${sum}, not 1`)
})

test('blendCategoryScores rounds and clamps the way the score pipeline needs', () => {
  assert.equal(blendCategoryScores(100, 100, 100), 100)
  assert.equal(blendCategoryScores(0, 0, 0), 0)
  // 0.4*63 + 0.35*53 + 0.25*70 = 61.25 -> 61, the ml-medium-match boundary case
  assert.equal(blendCategoryScores(63, 53, 70), 61)
})

test('the score band thresholds have not moved', () => {
  // expectedLabel on every case depends on these three bands.
  assert.equal(getScoreLabel(85), 'Likely Interview Candidate')
  assert.equal(getScoreLabel(84), 'Needs Improvement')
  assert.equal(getScoreLabel(61), 'Needs Improvement')
  assert.equal(getScoreLabel(60), 'Not a Fit')
})

test('no fixture contains a contact detail shaped like a real one', () => {
  const emailish = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
  const phoneish = /\+?\d[\d\s().-]{8,}\d/
  for (const c of SYNTHETIC_CASES) {
    const blob = `${c.cv} ${c.jobDescription}`
    assert.ok(!emailish.test(blob), `${c.id} contains an email-shaped string`)
    assert.ok(!phoneish.test(blob), `${c.id} contains a phone-shaped string`)
  }
})

console.log(`\n${passed} tests passed`)
