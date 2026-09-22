// Run with: npx tsx admin/src/lib/creditGrant.test.ts
import assert from 'node:assert/strict'
import { resolveGrant } from './creditGrant'

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

test('single plan grants one free check tagged as the Starter tier', () => {
  assert.deepEqual(resolveGrant('single'), { amount: 1, packId: 'small' })
})

test('power plan grants forty checks tagged as the Power tier', () => {
  // packId 'large' is what generate-documents/logic.ts requires for Cover
  // Letter and Recruiter Message entitlement (fundingPackId === 'large').
  // Without it, a "free Power pack" grant would unlock nothing at all.
  assert.deepEqual(resolveGrant('power'), { amount: 40, packId: 'large' })
})

test('an unrecognised plan is rejected rather than defaulted', () => {
  assert.equal(resolveGrant('unlimited'), null)
  assert.equal(resolveGrant(''), null)
})

test('inherited Object properties are not mistaken for a plan', () => {
  assert.equal(resolveGrant('toString'), null)
  assert.equal(resolveGrant('constructor'), null)
})

console.log(`\n${passed} tests passed`)
