// Run with: npx tsx supabase/functions/send-welcome-email/logic.test.ts
import assert from 'node:assert/strict'
import { isEmailConfirmed, isRolloutEligible, type AuthenticatedUser } from './logic.ts'

let passed = 0
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passed += 1
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`FAIL - ${name}`)
    throw error
  }
}

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'user-1',
    email: 'jordan@example.com',
    email_confirmed_at: '2026-08-27T01:00:00Z',
    ...overrides,
  }
}

async function run() {
  await test('isEmailConfirmed is true when both email and email_confirmed_at are present', () => {
    assert.equal(isEmailConfirmed(user()), true)
  })

  await test('isEmailConfirmed is false when email_confirmed_at is null (unverified)', () => {
    assert.equal(isEmailConfirmed(user({ email_confirmed_at: null })), false)
  })

  await test('isEmailConfirmed is false when email is missing', () => {
    assert.equal(isEmailConfirmed(user({ email: null })), false)
  })

  await test('isRolloutEligible is true when the account was created on the cutoff instant', () => {
    assert.equal(isRolloutEligible('2026-08-27T00:00:00Z', '2026-08-27T00:00:00Z'), true)
  })

  await test('isRolloutEligible is true when the account was created after the cutoff', () => {
    assert.equal(isRolloutEligible('2026-08-27T00:00:01Z', '2026-08-27T00:00:00Z'), true)
  })

  await test('isRolloutEligible is false when the account was created before the cutoff (existing verified users)', () => {
    assert.equal(isRolloutEligible('2026-08-26T23:59:59Z', '2026-08-27T00:00:00Z'), false)
  })

  await test('isRolloutEligible fails closed when the rollout env var is unset', () => {
    assert.equal(isRolloutEligible('2099-01-01T00:00:00Z', undefined), false)
    assert.equal(isRolloutEligible('2099-01-01T00:00:00Z', null), false)
    assert.equal(isRolloutEligible('2099-01-01T00:00:00Z', ''), false)
  })

  await test('isRolloutEligible fails closed when the rollout env var is unparseable', () => {
    assert.equal(isRolloutEligible('2099-01-01T00:00:00Z', 'not-a-date'), false)
  })

  await test('isRolloutEligible fails closed when the profile created_at is somehow unparseable', () => {
    assert.equal(isRolloutEligible('not-a-date', '2026-08-27T00:00:00Z'), false)
  })

  console.log(`\n${passed} passed`)
}

void run()
