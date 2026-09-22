// Run with: npx tsx src/lib/outcomeForm.test.ts
import assert from 'node:assert/strict'
import {
  CHANNEL_OPTIONS,
  EMPTY_OUTCOME_FORM,
  OUTCOME_CONSENT_TEXT,
  STAGE_OPTIONS,
  buildOutcomePayload,
  canSubmitOutcome,
} from './outcomeForm'

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

test('an empty form cannot be submitted', () => {
  assert.equal(canSubmitOutcome(EMPTY_OUTCOME_FORM), false)
})

test('did not apply is enough on its own, and sends nothing else', () => {
  const state = { ...EMPTY_OUTCOME_FORM, applied: 'no' as const, channel: 'referral', salary: '50000' }
  assert.equal(canSubmitOutcome(state), true)
  assert.deepEqual(buildOutcomePayload(state), { applied: false })
})

test('applied needs a channel and a stage', () => {
  const base = { ...EMPTY_OUTCOME_FORM, applied: 'yes' as const }
  assert.equal(canSubmitOutcome(base), false)
  assert.equal(canSubmitOutcome({ ...base, channel: 'referral' }), false)
  assert.equal(canSubmitOutcome({ ...base, channel: 'referral', stage: 'rejected' }), true)
})

test('reply time is dropped for no reply, and salary for anything but an offer', () => {
  const state = {
    ...EMPTY_OUTCOME_FORM,
    applied: 'yes' as const,
    channel: 'job_board',
    stage: 'no_reply',
    daysToReply: '4',
    salary: '40000',
    country: 'NL',
  }
  assert.deepEqual(buildOutcomePayload(state), { applied: true, channel: 'job_board', stage: 'no_reply' })
  assert.deepEqual(buildOutcomePayload({ ...state, stage: 'interview' }), {
    applied: true,
    channel: 'job_board',
    stage: 'interview',
    days_to_reply: '4',
  })
})

test('an offer with a salary sends amount, currency and country', () => {
  const state = {
    ...EMPTY_OUTCOME_FORM,
    applied: 'yes' as const,
    channel: 'company_site',
    stage: 'offer',
    salary: ' 55000 ',
    currency: 'EUR',
    country: 'NL',
  }
  assert.equal(canSubmitOutcome(state), true)
  assert.deepEqual(buildOutcomePayload(state), {
    applied: true,
    channel: 'company_site',
    stage: 'offer',
    salary_offered: '55000',
    salary_currency: 'EUR',
    salary_country: 'NL',
  })
  assert.equal(canSubmitOutcome({ ...state, country: '' }), false)
})

test('the option values match what the server accepts', () => {
  assert.deepEqual(
    CHANNEL_OPTIONS.map((o) => o.value),
    ['job_board', 'referral', 'company_site', 'other'],
  )
  assert.deepEqual(
    STAGE_OPTIONS.map((o) => o.value),
    ['no_reply', 'rejected', 'interview', 'offer'],
  )
})

test('user facing copy contains no dashes', () => {
  const copy = [OUTCOME_CONSENT_TEXT, ...CHANNEL_OPTIONS.map((o) => o.label), ...STAGE_OPTIONS.map((o) => o.label)]
  for (const text of copy) assert.ok(!/[‒–—―]| - /.test(text), text)
})

console.log(`\n${passed} tests passed`)
