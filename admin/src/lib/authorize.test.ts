// Run with: npx tsx admin/src/lib/authorize.test.ts
import assert from 'node:assert/strict'
import { decideAdminAccess, type VerifiedSession } from './authorize'
import type { AdminUserRow } from '../types/db'

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

const UID = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'

const session = (over: Partial<VerifiedSession> = {}): VerifiedSession => ({
  userId: UID,
  assuranceLevel: 'aal1',
  hasEnrolledMfa: false,
  ...over,
})

const admin = (over: Partial<AdminUserRow> = {}): AdminUserRow => ({
  user_id: UID,
  email: 'owner@example.test',
  role: 'owner',
  timezone: 'Europe/London',
  created_at: '2026-09-01T00:00:00Z',
  disabled_at: null,
  ...over,
})

test('an allowlisted admin with a session is allowed', () => {
  const d = decideAdminAccess(session(), admin())
  assert.equal(d.allowed, true)
  if (d.allowed) assert.equal(d.admin.user_id, UID)
})

test('no session is denied', () => {
  assert.deepEqual(decideAdminAccess(null, admin()), { allowed: false, reason: 'no_session' })
})

test('a valid session that is not on the allowlist is denied', () => {
  // The ordinary-customer case: real account, real session, no admin access.
  assert.deepEqual(decideAdminAccess(session(), null), {
    allowed: false,
    reason: 'not_on_allowlist',
  })
})

test('a disabled admin is denied', () => {
  assert.deepEqual(decideAdminAccess(session(), admin({ disabled_at: '2026-09-02T00:00:00Z' })), {
    allowed: false,
    reason: 'account_disabled',
  })
})

test('an admin row belonging to a different user is denied', () => {
  // Guards against a lookup keyed on anything other than the session user.
  assert.deepEqual(decideAdminAccess(session(), admin({ user_id: OTHER })), {
    allowed: false,
    reason: 'not_on_allowlist',
  })
})

test('an enrolled admin still at aal1 must complete MFA', () => {
  assert.deepEqual(
    decideAdminAccess(session({ hasEnrolledMfa: true, assuranceLevel: 'aal1' }), admin()),
    { allowed: false, reason: 'mfa_required' },
  )
})

test('an enrolled admin at aal2 is allowed', () => {
  const d = decideAdminAccess(
    session({ hasEnrolledMfa: true, assuranceLevel: 'aal2' }),
    admin(),
  )
  assert.equal(d.allowed, true)
})

test('an admin with no factor enrolled is not blocked by the MFA rule', () => {
  // Enforcing MFA on everyone before anyone has enrolled would lock the owner
  // out of the dashboard they need in order to enrol.
  const d = decideAdminAccess(session({ hasEnrolledMfa: false, assuranceLevel: 'aal1' }), admin())
  assert.equal(d.allowed, true)
})

test('a disabled account is denied even at aal2', () => {
  assert.deepEqual(
    decideAdminAccess(
      session({ hasEnrolledMfa: true, assuranceLevel: 'aal2' }),
      admin({ disabled_at: '2026-09-02T00:00:00Z' }),
    ),
    { allowed: false, reason: 'account_disabled' },
  )
})

test('the admin role field never widens access on its own', () => {
  // Both roles are allowed through; role governs capability inside the app,
  // never whether the door opens. Presence on the allowlist is the gate.
  for (const role of ['owner', 'admin'] as const) {
    assert.equal(decideAdminAccess(session(), admin({ role })).allowed, true)
  }
  // And with no row at all, no role value can help.
  assert.equal(decideAdminAccess(session(), null).allowed, false)
})

console.log(`\n${passed} tests passed`)
