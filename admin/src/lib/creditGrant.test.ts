// Run with: npx tsx admin/src/lib/creditGrant.test.ts
import assert from 'node:assert/strict'
import { resolveGrantAmount } from './creditGrant'

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

test('single plan grants one free check', () => {
  assert.equal(resolveGrantAmount('single'), 1)
})

test('power plan grants forty checks, matching the Power pack size', () => {
  assert.equal(resolveGrantAmount('power'), 40)
})

test('an unrecognised plan is rejected rather than defaulted', () => {
  assert.equal(resolveGrantAmount('unlimited'), null)
  assert.equal(resolveGrantAmount(''), null)
})

test('inherited Object properties are not mistaken for a plan', () => {
  assert.equal(resolveGrantAmount('toString'), null)
  assert.equal(resolveGrantAmount('constructor'), null)
})

console.log(`\n${passed} tests passed`)
