// Run with: npx tsx supabase/functions/_shared/stripe-environment.test.ts
//
// The keys below are obviously fake literals, never real credentials.
import assert from 'node:assert/strict'
import {
  getStripeEnvironment,
  assertSecretKeyMatchesEnvironment,
} from './stripe-environment.ts'

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

const TEST_KEY = 'sk_test_0000000000000000EXAMPLE'
const LIVE_KEY = 'sk_live_0000000000000000EXAMPLE'

// --- the matrix the guard exists for --------------------------------------

test('production + live key passes', () => {
  assertSecretKeyMatchesEnvironment(LIVE_KEY, 'production')
})

test('production + test key fails', () => {
  assert.throws(
    () => assertSecretKeyMatchesEnvironment(TEST_KEY, 'production'),
    /stripe_key_environment_mismatch/,
  )
})

test('test + test key passes', () => {
  assertSecretKeyMatchesEnvironment(TEST_KEY, 'test')
})

test('test + live key fails', () => {
  assert.throws(
    () => assertSecretKeyMatchesEnvironment(LIVE_KEY, 'test'),
    /stripe_key_environment_mismatch/,
  )
})

test('an unknown key prefix fails in either environment', () => {
  for (const env of ['test', 'production'] as const) {
    for (const key of ['pk_live_abc', 'rk_test_abc', 'sk_abc', '', 'sk_test', 'SK_LIVE_ABC']) {
      assert.throws(
        () => assertSecretKeyMatchesEnvironment(key, env),
        /invalid_stripe_secret_key/,
        `expected ${JSON.stringify(key)} to be rejected in ${env}`,
      )
    }
  }
})

// --- fail closed on the environment itself --------------------------------

test('a missing environment fails', () => {
  assert.throws(() => getStripeEnvironment(undefined), /invalid_stripe_environment/)
  assert.throws(() => getStripeEnvironment(undefined), /unset/)
})

test('an invalid environment fails', () => {
  for (const value of ['', 'prod', 'Production', 'PRODUCTION', 'live', 'staging', 'test ', ' test']) {
    assert.throws(
      () => getStripeEnvironment(value),
      /invalid_stripe_environment/,
      `expected ${JSON.stringify(value)} to be rejected`,
    )
  }
})

test('the two valid environments are returned unchanged', () => {
  assert.equal(getStripeEnvironment('test'), 'test')
  assert.equal(getStripeEnvironment('production'), 'production')
})

test('there is no default: nothing resolves to an environment on its own', () => {
  // Guards against a future edit adding a fallback, which would reintroduce
  // exactly the silent-wrong-mode failure this module exists to prevent.
  assert.throws(() => getStripeEnvironment(undefined), /invalid_stripe_environment/)
  assert.throws(() => getStripeEnvironment(null as unknown as string), /invalid_stripe_environment/)
})

// --- the live production configuration ------------------------------------

test('the intended production configuration is accepted', () => {
  const environment = getStripeEnvironment('production')
  assertSecretKeyMatchesEnvironment(LIVE_KEY, environment)
})

console.log(`\n${passed} tests passed`)
