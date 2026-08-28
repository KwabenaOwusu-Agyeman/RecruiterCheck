// Run with: npx tsx supabase/functions/send-password-changed-email/logic.test.ts
import assert from 'node:assert/strict'
import { didPasswordChange, extractUser, type AuthUserWebhookPayload } from './logic.ts'

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

function payload(overrides: Partial<AuthUserWebhookPayload> = {}): AuthUserWebhookPayload {
  return {
    type: 'UPDATE',
    table: 'users',
    record: { id: 'user-1', email: 'jordan@example.com', encrypted_password: 'hash-b' },
    old_record: { encrypted_password: 'hash-a' },
    ...overrides,
  }
}

async function run() {
  await test('didPasswordChange is true when the encrypted_password hash differs', () => {
    assert.equal(didPasswordChange(payload()), true)
  })

  await test('didPasswordChange is false when the hash is unchanged (e.g. a plain login updating last_sign_in_at)', () => {
    assert.equal(
      didPasswordChange(payload({ record: { id: 'user-1', email: 'a@b.com', encrypted_password: 'hash-a' } })),
      false,
    )
  })

  await test('didPasswordChange is false when either hash is missing', () => {
    assert.equal(didPasswordChange(payload({ old_record: {} })), false)
    assert.equal(didPasswordChange(payload({ record: { id: 'user-1', email: 'a@b.com' } })), false)
  })

  await test('didPasswordChange is false for non-UPDATE events', () => {
    assert.equal(didPasswordChange(payload({ type: 'INSERT' })), false)
  })

  await test('extractUser returns null when id or email is missing', () => {
    assert.equal(extractUser(payload({ record: { id: undefined, email: 'a@b.com' } })), null)
  })

  console.log(`\n${passed} passed`)
}

void run()
