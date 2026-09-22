// Run with: npx tsx src/lib/researchConsent.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  RESEARCH_CONSENT_POINTS,
  RESEARCH_CONSENT_TEXT,
  RESEARCH_CONSENT_VERSION,
  describeResearchConsent,
  toResearchConsentState,
} from './researchConsent'

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

const row = (withdrawn: string | null) => ({
  consent_version: RESEARCH_CONSENT_VERSION,
  granted_at: '2026-09-22T10:00:00.000Z',
  withdrawn_at: withdrawn,
})

test('no row means consent was never given', () => {
  const state = toResearchConsentState(null)
  assert.deepEqual(state, { granted: false, withdrawn: false, grantedAt: null })
  assert.equal(describeResearchConsent(state), 'Off')
})

test('a live row is consent, and keeps the date it was given', () => {
  const state = toResearchConsentState(row(null))
  assert.equal(state.granted, true)
  assert.equal(state.withdrawn, false)
  assert.equal(state.grantedAt, '2026-09-22T10:00:00.000Z')
  assert.equal(describeResearchConsent(state), 'On, thank you')
})

test('a withdrawn row is not consent, and shows no date', () => {
  const state = toResearchConsentState(row('2026-09-23T10:00:00.000Z'))
  assert.equal(state.granted, false)
  assert.equal(state.withdrawn, true)
  assert.equal(state.grantedAt, null)
  assert.equal(describeResearchConsent(state), 'Withdrawn')
})

test('the consent text names the limits it is there to set', () => {
  const text = RESEARCH_CONSENT_TEXT.toLowerCase()
  for (const promise of ['name', 'email', 'employer', 'removed', 'withdraw']) {
    assert.ok(text.includes(promise), `consent text should mention ${promise}`)
  }
  // The decision allows model training only if the consent says so. It does
  // not, so the text must rule it out rather than stay silent.
  assert.ok(
    /nothing here is used to train ai models/.test(text),
    'consent text must exclude model training',
  )
})

test('the privacy policy still says models are not trained on this data', () => {
  const policy = readFileSync('src/pages/PrivacyPage.tsx', 'utf8')
  assert.ok(policy.includes('not used by us to train models'))
  assert.ok(policy.includes('does not include training AI models'))
})

test('the card lists three points, the house limit', () => {
  assert.equal(RESEARCH_CONSENT_POINTS.length, 3)
})

test('user facing copy contains no dashes', () => {
  for (const text of [RESEARCH_CONSENT_TEXT, ...RESEARCH_CONSENT_POINTS]) {
    assert.ok(!/[‒–—―]| - /.test(text), text)
  }
})

test('the version is a plain date stamp, so a changed wording is a new version', () => {
  assert.match(RESEARCH_CONSENT_VERSION, /^\d{4}-\d{2}-\d{2}$/)
})

console.log(`\n${passed} tests passed`)
