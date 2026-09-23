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
  // That is the pack-holder-with-a-strong-score branch; the no-pack message
  // (null, 70) is a different string that deliberately names no pack at all.
  assert.ok(getDocumentEntitlement('medium', 90).blockedReason!.includes('Power'))
})

// ---------------------------------------------------------------------------
// Full entitlement matrix: every pack x every score group.
// ---------------------------------------------------------------------------

const NOT_A_FIT = 30
const NEEDS_IMPROVEMENT = 75
const LIKELY_INTERVIEW_CANDIDATE = 92

test('MATRIX: Starter (small) x Not a Fit -> no documents, no pricing CTA (buying would not help this result)', () => {
  const e = getDocumentEntitlement('small', NOT_A_FIT)
  assert.deepEqual([e.cv, e.coverLetter, e.recruiterMessage], [false, false, false])
  assert.ok(e.blockedReason)
  assert.equal(e.showPricingCta, false)
})

test('MATRIX: Starter (small) x Needs Improvement -> CV only', () => {
  const e = getDocumentEntitlement('small', NEEDS_IMPROVEMENT)
  assert.deepEqual([e.cv, e.coverLetter, e.recruiterMessage], [true, false, false])
  assert.equal(e.blockedReason, null)
  assert.equal(e.showPricingCta, false)
})

test('MATRIX: Starter (small) x Likely Interview Candidate -> nothing, blocked, pricing CTA (Power would unlock cover letter/recruiter message)', () => {
  const e = getDocumentEntitlement('small', LIKELY_INTERVIEW_CANDIDATE)
  assert.deepEqual([e.cv, e.coverLetter, e.recruiterMessage], [false, false, false])
  assert.ok(e.blockedReason)
  assert.equal(e.showPricingCta, true)
})

test('MATRIX: Active (medium) x Not a Fit -> no documents, no pricing CTA', () => {
  const e = getDocumentEntitlement('medium', NOT_A_FIT)
  assert.deepEqual([e.cv, e.coverLetter, e.recruiterMessage], [false, false, false])
  assert.ok(e.blockedReason)
  assert.equal(e.showPricingCta, false)
})

test('MATRIX: Active (medium) x Needs Improvement -> CV only', () => {
  const e = getDocumentEntitlement('medium', NEEDS_IMPROVEMENT)
  assert.deepEqual([e.cv, e.coverLetter, e.recruiterMessage], [true, false, false])
  assert.equal(e.blockedReason, null)
  assert.equal(e.showPricingCta, false)
})

test('MATRIX: Active (medium) x Likely Interview Candidate -> nothing, blocked, pricing CTA', () => {
  const e = getDocumentEntitlement('medium', LIKELY_INTERVIEW_CANDIDATE)
  assert.deepEqual([e.cv, e.coverLetter, e.recruiterMessage], [false, false, false])
  assert.ok(e.blockedReason)
  assert.equal(e.showPricingCta, true)
})

test('MATRIX: Power (large) x Not a Fit -> no documents, no pricing CTA', () => {
  const e = getDocumentEntitlement('large', NOT_A_FIT)
  assert.deepEqual([e.cv, e.coverLetter, e.recruiterMessage], [false, false, false])
  assert.ok(e.blockedReason)
  assert.equal(e.showPricingCta, false)
})

test('MATRIX: Power (large) x Needs Improvement -> CV, cover letter, and recruiter message', () => {
  const e = getDocumentEntitlement('large', NEEDS_IMPROVEMENT)
  assert.deepEqual([e.cv, e.coverLetter, e.recruiterMessage], [true, true, true])
  assert.equal(e.blockedReason, null)
  assert.equal(e.showPricingCta, false)
})

test('MATRIX: Power (large) x Likely Interview Candidate -> cover letter and recruiter message, never a CV', () => {
  const e = getDocumentEntitlement('large', LIKELY_INTERVIEW_CANDIDATE)
  assert.deepEqual([e.cv, e.coverLetter, e.recruiterMessage], [false, true, true])
  assert.equal(e.blockedReason, null)
  assert.equal(e.showPricingCta, false)
})

test('MATRIX: no pack at all (free tier) -> no documents at any score, pricing CTA always shown regardless of the result', () => {
  for (const score of [NOT_A_FIT, NEEDS_IMPROVEMENT, LIKELY_INTERVIEW_CANDIDATE]) {
    const e = getDocumentEntitlement(null, score)
    assert.deepEqual([e.cv, e.coverLetter, e.recruiterMessage], [false, false, false])
    assert.ok(e.blockedReason)
    assert.equal(e.showPricingCta, true)
  }
})

// ---------------------------------------------------------------------------
// Free tier message accuracy: the message must vary by score group, the same
// way a paid user's does, so a free user never buys a pack expecting a
// document this score would not produce even once paid.
// ---------------------------------------------------------------------------

test('FREE TIER: Not a Fit tells the free user a pack would not change this result, not a generic upsell', () => {
  const e = getDocumentEntitlement(null, NOT_A_FIT)
  assert.match(e.blockedReason!, /not a strong match/i)
  assert.match(e.blockedReason!, /paid check pack would not change/i)
  // Must not repeat the generic "Buy a check pack to also get..." pitch —
  // that would misleadingly imply buying helps this specific result.
  assert.doesNotMatch(e.blockedReason!, /Buy a check pack to also get/i)
})

test('FREE TIER: Not a Fit reads as the same fact as the paid Not a Fit explanation, not a different one', () => {
  const free = getDocumentEntitlement(null, NOT_A_FIT)
  const paid = getDocumentEntitlement('small', NOT_A_FIT)
  assert.ok(free.blockedReason!.startsWith(paid.blockedReason!))
})

test('FREE TIER: Needs Improvement keeps the generic pack pitch, since buying genuinely unlocks a CV Draft here', () => {
  const e = getDocumentEntitlement(null, NEEDS_IMPROVEMENT)
  assert.match(e.blockedReason!, /Buy a check pack to also get an Improved CV Draft/i)
})

test('FREE TIER: Likely Interview Candidate never implies a CV Draft is available, on any pack', () => {
  const e = getDocumentEntitlement(null, LIKELY_INTERVIEW_CANDIDATE)
  assert.match(e.blockedReason!, /CV Draft is not offered at this score/i)
  assert.match(e.blockedReason!, /Power/i)
  assert.doesNotMatch(e.blockedReason!, /Buy a check pack to also get an Improved CV Draft/i)
})

test('FREE TIER: Likely Interview Candidate names the same missing documents as the paid non-Power equivalent', () => {
  const free = getDocumentEntitlement(null, LIKELY_INTERVIEW_CANDIDATE)
  const paidNonPower = getDocumentEntitlement('small', LIKELY_INTERVIEW_CANDIDATE)
  assert.match(free.blockedReason!, /Cover Letter and Recruiter Message/i)
  assert.match(paidNonPower.blockedReason!, /Cover Letter and Recruiter Message/i)
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
