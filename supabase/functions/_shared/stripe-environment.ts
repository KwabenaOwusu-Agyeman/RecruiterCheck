// Stripe environment guard.
//
// Nothing in this codebase previously checked which Stripe mode a deployment
// was talking to: every function read STRIPE_SECRET_KEY and handed it to the
// SDK. A test key in production silently fails to charge anyone; a live key in
// a preview environment silently charges real cards. Both are quiet failures,
// which is the worst kind for payments.
//
// STRIPE_ENVIRONMENT declares the intent, the secret key carries the fact, and
// these functions refuse to let them disagree. There is deliberately no
// default: an unset or misspelled value throws rather than guessing, because a
// guessed payment environment is exactly what this exists to prevent.
//
// Both functions are pure apart from the one documented Deno.env read, so the
// test suite exercises them under `npx tsx` by passing the value explicitly.

export type StripeEnvironment = 'test' | 'production'

/**
 * Resolves the declared Stripe environment.
 *
 * Pass `rawValue` to supply it directly (the tests do this). Omit it inside an
 * Edge Function and it reads STRIPE_ENVIRONMENT from the Deno environment.
 * Throws on anything other than exactly "test" or "production".
 */
export function getStripeEnvironment(rawValue?: string): StripeEnvironment {
  // Not a default parameter: passing `undefined` explicitly would still
  // evaluate the default and reach for Deno, which does not exist under the
  // tsx test runner. Resolve it here so "not supplied" and "explicitly
  // undefined" behave identically in both runtimes, and both fail closed.
  // Read through globalThis rather than the `Deno` global directly: redeclaring
  // `Deno` would collide with Deno's own types when it type-checks on deploy.
  const runtime = (globalThis as { Deno?: { env: { get(key: string): string | undefined } } }).Deno
  const value = rawValue !== undefined ? rawValue : runtime?.env.get('STRIPE_ENVIRONMENT')

  if (value !== 'test' && value !== 'production') {
    throw new Error(
      `invalid_stripe_environment: STRIPE_ENVIRONMENT must be exactly "test" or "production" (got: ${
        value === undefined ? 'unset' : JSON.stringify(value)
      })`,
    )
  }
  return value
}

/**
 * Refuses a secret key that does not match the declared environment, in both
 * directions, and refuses any key that is neither a test nor a live key.
 */
export function assertSecretKeyMatchesEnvironment(
  secretKey: string,
  environment: StripeEnvironment,
): void {
  const isTestKey = secretKey.startsWith('sk_test_')
  const isLiveKey = secretKey.startsWith('sk_live_')

  if (!isTestKey && !isLiveKey) {
    throw new Error('invalid_stripe_secret_key: does not start with sk_test_ or sk_live_')
  }
  if (environment === 'test' && !isTestKey) {
    throw new Error(
      'stripe_key_environment_mismatch: STRIPE_ENVIRONMENT=test but the configured secret key is a live key',
    )
  }
  if (environment === 'production' && !isLiveKey) {
    throw new Error(
      'stripe_key_environment_mismatch: STRIPE_ENVIRONMENT=production but the configured secret key is a test key',
    )
  }
}

/**
 * Convenience wrapper for the four call sites: resolve the environment and
 * check the key in one step. Throws on any mismatch or misconfiguration.
 */
export function assertStripeEnvironment(secretKey: string): StripeEnvironment {
  const environment = getStripeEnvironment()
  assertSecretKeyMatchesEnvironment(secretKey, environment)
  return environment
}
