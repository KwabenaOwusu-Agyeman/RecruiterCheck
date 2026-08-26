// Run with: npx tsx src/lib/documentEntitlement.test.ts
import assert from 'node:assert/strict'
import { getDocumentEntitlement, LIKELY_INTERVIEW_CANDIDATE_MIN_SCORE, NOT_A_FIT_MAX_SCORE } from './documentEntitlement'
import { PACK_DISPLAY_NAMES, getPackDisplayName } from './constants'

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

// ---------------------------------------------------------------------------
// Canonical pack naming: Starter/Active/Power only, never small/medium/large,
// in any user facing string this module produces.
// ---------------------------------------------------------------------------

test('PACK NAMING: the canonical mapping is exactly Starter/Active/Power', () => {
  assert.deepEqual(PACK_DISPLAY_NAMES, { small: 'Starter', medium: 'Active', large: 'Power' })
})

test('PACK NAMING: getPackDisplayName resolves every internal id and null correctly', () => {
  assert.equal(getPackDisplayName('small'), 'Starter')
  assert.equal(getPackDisplayName('medium'), 'Active')
  assert.equal(getPackDisplayName('large'), 'Power')
  assert.equal(getPackDisplayName(null), 'Free')
})

test('PACK NAMING: no blockedReason ever contains a legacy internal identifier', () => {
  const allReasons = [
    getDocumentEntitlement(null, 70).blockedReason,
    getDocumentEntitlement('small', 30).blockedReason,
    getDocumentEntitlement('medium', 90).blockedReason,
    getDocumentEntitlement('large', 30).blockedReason,
  ].filter((r): r is string => r !== null)
  assert.ok(allReasons.length > 0)
  for (const reason of allReasons) {
    assert.ok(!/\bsmall\b/i.test(reason), reason)
    assert.ok(!/\bmedium\b/i.test(reason), reason)
    assert.ok(!/\blarge\b/i.test(reason), reason)
  }
  // The upsell message does name the Power pack by its real product name.
  assert.ok(getDocumentEntitlement(null, 70).blockedReason!.includes('Power'))
})

// ---------------------------------------------------------------------------
// Full entitlement matrix: every pack x every score group.
// ---------------------------------------------------------------------------

const NOT_A_FIT = 30
const NEEDS_IMPROVEMENT = 75
const LIKELY_INTERVIEW_CANDIDATE = 92

test('MATRIX: Starter (small) x Not a Fit -> no documents', () => {
  const e = getDocumentEntitlement('small', NOT_A_FIT)
  assert.deepEqual([e.cv, e.coverLetter, e.recruiterMessage], [false, false, false])
  assert.ok(e.blockedReason)
})

test('MATRIX: Starter (small) x Needs Improvement -> CV only', () => {
  const e = getDocumentEntitlement('small', NEEDS_IMPROVEMENT)
  assert.deepEqual([e.cv, e.coverLetter, e.recruiterMessage], [true, false, false])
  assert.equal(e.blockedReason, null)
})

test('MATRIX: Starter (small) x Likely Interview Candidate -> nothing, blocked (Starter has no cover letter/recruiter tier)', () => {
  const e = getDocumentEntitlement('small', LIKELY_INTERVIEW_CANDIDATE)
  assert.deepEqual([e.cv, e.coverLetter, e.recruiterMessage], [false, false, false])
  assert.ok(e.blockedReason)
})

test('MATRIX: Active (medium) x Not a Fit -> no documents', () => {
  const e = getDocumentEntitlement('medium', NOT_A_FIT)
  assert.deepEqual([e.cv, e.coverLetter, e.recruiterMessage], [false, false, false])
  assert.ok(e.blockedReason)
})

test('MATRIX: Active (medium) x Needs Improvement -> CV only', () => {
  const e = getDocumentEntitlement('medium', NEEDS_IMPROVEMENT)
  assert.deepEqual([e.cv, e.coverLetter, e.recruiterMessage], [true, false, false])
  assert.equal(e.blockedReason, null)
})

test('MATRIX: Active (medium) x Likely Interview Candidate -> nothing, blocked', () => {
  const e = getDocumentEntitlement('medium', LIKELY_INTERVIEW_CANDIDATE)
  assert.deepEqual([e.cv, e.coverLetter, e.recruiterMessage], [false, false, false])
  assert.ok(e.blockedReason)
})

test('MATRIX: Power (large) x Not a Fit -> no documents', () => {
  const e = getDocumentEntitlement('large', NOT_A_FIT)
  assert.deepEqual([e.cv, e.coverLetter, e.recruiterMessage], [false, false, false])
  assert.ok(e.blockedReason)
})

test('MATRIX: Power (large) x Needs Improvement -> CV, cover letter, and recruiter message', () => {
  const e = getDocumentEntitlement('large', NEEDS_IMPROVEMENT)
  assert.deepEqual([e.cv, e.coverLetter, e.recruiterMessage], [true, true, true])
  assert.equal(e.blockedReason, null)
})

test('MATRIX: Power (large) x Likely Interview Candidate -> cover letter and recruiter message, never a CV', () => {
  const e = getDocumentEntitlement('large', LIKELY_INTERVIEW_CANDIDATE)
  assert.deepEqual([e.cv, e.coverLetter, e.recruiterMessage], [false, true, true])
  assert.equal(e.blockedReason, null)
})

test('MATRIX: no pack at all (free tier) -> no documents at any score', () => {
  for (const score of [NOT_A_FIT, NEEDS_IMPROVEMENT, LIKELY_INTERVIEW_CANDIDATE]) {
    const e = getDocumentEntitlement(null, score)
    assert.deepEqual([e.cv, e.coverLetter, e.recruiterMessage], [false, false, false])
    assert.ok(e.blockedReason)
  }
})

// ---------------------------------------------------------------------------
// The bug fix this release makes: Starter must be visibly entitled to the
// CV, not treated the same as "no pack" the way the previous inline
// `fundingPackId !== 'medium' && fundingPackId !== 'large'` check in
// FeedbackPage.tsx did.
// ---------------------------------------------------------------------------

test('BUG FIX: Starter (small) is entitled to a CV, distinctly from having no pack at all', () => {
  const starter = getDocumentEntitlement('small', NEEDS_IMPROVEMENT)
  const noPack = getDocumentEntitlement(null, NEEDS_IMPROVEMENT)
  assert.equal(starter.cv, true)
  assert.equal(noPack.cv, false)
  assert.notEqual(starter.blockedReason, noPack.blockedReason)
})

// ---------------------------------------------------------------------------
// Score group boundaries — no gaps or overlaps, matching getScoreLabel.
// ---------------------------------------------------------------------------

test('BOUNDARIES: score group thresholds have no gaps or overlaps', () => {
  assert.equal(NOT_A_FIT_MAX_SCORE, 60)
  assert.equal(LIKELY_INTERVIEW_CANDIDATE_MIN_SCORE, 85)
  assert.equal(getDocumentEntitlement('large', 60).cv, false) // Not a Fit
  assert.equal(getDocumentEntitlement('large', 61).cv, true) // Needs Improvement
  assert.equal(getDocumentEntitlement('large', 84).cv, true) // Needs Improvement
  assert.equal(getDocumentEntitlement('large', 85).cv, false) // Likely Interview Candidate
})

console.log(`\n${passed} tests passed`)
