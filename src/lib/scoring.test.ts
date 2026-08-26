// Run with: npx tsx src/lib/scoring.test.ts
import assert from 'node:assert/strict'
import { sanitizeScore } from './scoring'

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

test('sanitizeScore accepts a valid integer unchanged', () => {
  assert.equal(sanitizeScore(78), 78)
  assert.equal(sanitizeScore(0), 0)
  assert.equal(sanitizeScore(100), 100)
})

test('sanitizeScore rounds a decimal to the nearest whole number', () => {
  assert.equal(sanitizeScore(77.6), 78)
  assert.equal(sanitizeScore(77.4), 77)
})

test('sanitizeScore clamps an out of range value into 0-100', () => {
  assert.equal(sanitizeScore(150), 100)
  assert.equal(sanitizeScore(-20), 0)
  assert.equal(sanitizeScore(-0.4), 0)
})

test('sanitizeScore rejects a numeric string rather than coercing it', () => {
  assert.equal(sanitizeScore('78'), null)
  assert.equal(sanitizeScore('78%'), null)
})

test('sanitizeScore rejects null, undefined, and NaN', () => {
  assert.equal(sanitizeScore(null), null)
  assert.equal(sanitizeScore(undefined), null)
  assert.equal(sanitizeScore(NaN), null)
})

test('sanitizeScore rejects Infinity', () => {
  assert.equal(sanitizeScore(Infinity), null)
  assert.equal(sanitizeScore(-Infinity), null)
})

test('sanitizeScore rejects an array, including a single-element array', () => {
  assert.equal(sanitizeScore([78]), null)
  assert.equal(sanitizeScore([40, 35, 25]), null)
  assert.equal(sanitizeScore([]), null)
})

test('sanitizeScore rejects a plain object', () => {
  assert.equal(sanitizeScore({ value: 78 }), null)
  assert.equal(sanitizeScore({}), null)
})

test('sanitizeScore rejects a boolean', () => {
  assert.equal(sanitizeScore(true), null)
  assert.equal(sanitizeScore(false), null)
})

console.log(`\n${passed} tests passed`)
