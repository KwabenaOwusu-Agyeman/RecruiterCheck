// Shared by stripe-webhook and create-checkout-session. Item F/28 plus the
// V4.1 Item 4 correction: environment-specific Stripe configuration is
// never trusted from a hardcoded literal OR from a `price_` prefix alone --
// Stripe Price IDs do not reliably encode test versus live mode in their
// prefix, so every configured Price is RETRIEVED from the live Stripe
// account and its real, verified attributes (active, one-time, currency,
// amount) are checked. Fails closed (throws) on any missing/malformed
// configuration, any environment/secret-key mismatch, or any Price that
// does not verify -- every caller must catch and return 503. Never logs a
// secret key.

export interface PackPriceEntry {
  packId: 'small' | 'medium' | 'large'
  expectedAmount: number
  expectedCurrency: string
}

export type VerifiedPriceConfig = Record<string, PackPriceEntry>

const EXPECTED_PACK_IDS = ['small', 'medium', 'large'] as const

/**
 * Reads and validates STRIPE_ENVIRONMENT. Throws (never returns a default)
 * if it is missing or not one of the two supported literal values -- an
 * application environment must always be explicit.
 */
export function getStripeEnvironment(): 'test' | 'production' {
  const value = Deno.env.get('STRIPE_ENVIRONMENT')
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
 * Throws if the secret key's own prefix does not match the declared
 * environment -- a test project must never be able to run against a live
 * secret key, and vice versa. Never logs the key itself, only its prefix
 * shape (test/live), which is not sensitive.
 */
export function assertSecretKeyMatchesEnvironment(
  secretKey: string,
  environment: 'test' | 'production',
): void {
  const isTestKey = secretKey.startsWith('sk_test_')
  const isLiveKey = secretKey.startsWith('sk_live_')
  if (!isTestKey && !isLiveKey) {
    throw new Error(
      'invalid_stripe_secret_key: does not start with sk_test_ or sk_live_',
    )
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

function parseRawConfig(
  raw: string | undefined,
): Record<string, PackPriceEntry> {
  if (!raw) {
    throw new Error('missing_price_config: STRIPE_PACK_PRICE_CONFIG is unset')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('malformed_price_config: not valid JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      'malformed_price_config: must be a JSON object of priceId -> entry',
    )
  }

  const entries = Object.entries(parsed as Record<string, unknown>)
  if (entries.length !== 3) {
    throw new Error(
      `malformed_price_config: expected exactly 3 pack entries, got ${entries.length}`,
    )
  }

  const seenPackIds = new Set<string>()
  const result: Record<string, PackPriceEntry> = {}

  for (const [priceId, value] of entries) {
    if (!priceId.startsWith('price_')) {
      throw new Error(
        `malformed_price_config: key "${priceId}" is not a Price ID`,
      )
    }
    if (typeof value !== 'object' || value === null) {
      throw new Error(
        `malformed_price_config: entry for ${priceId} is not an object`,
      )
    }
    const entry = value as Record<string, unknown>
    const packId = entry.packId
    const expectedAmount = entry.expectedAmount
    const expectedCurrency = entry.expectedCurrency

    if (
      typeof packId !== 'string' ||
      !(EXPECTED_PACK_IDS as readonly string[]).includes(packId)
    ) {
      throw new Error(
        `malformed_price_config: entry for ${priceId} has an invalid packId`,
      )
    }
    if (
      typeof expectedAmount !== 'number' || !Number.isInteger(expectedAmount) ||
      expectedAmount <= 0
    ) {
      throw new Error(
        `malformed_price_config: entry for ${priceId} has an invalid expectedAmount`,
      )
    }
    if (typeof expectedCurrency !== 'string' || expectedCurrency.length !== 3) {
      throw new Error(
        `malformed_price_config: entry for ${priceId} has an invalid expectedCurrency`,
      )
    }
    if (seenPackIds.has(packId)) {
      throw new Error(
        `malformed_price_config: pack "${packId}" is configured more than once (duplicate Price IDs for the same pack)`,
      )
    }
    seenPackIds.add(packId)
    result[priceId] = {
      packId: packId as PackPriceEntry['packId'],
      expectedAmount,
      expectedCurrency: expectedCurrency.toLowerCase(),
    }
  }

  for (const required of EXPECTED_PACK_IDS) {
    if (!seenPackIds.has(required)) {
      throw new Error(
        `malformed_price_config: missing an entry for pack "${required}"`,
      )
    }
  }

  return result
}

// Minimal shape this module needs from a Stripe client -- lets tests supply
// a mock without constructing a real Stripe instance or making network
// calls.
export interface StripePriceRetriever {
  prices: {
    retrieve(id: string): Promise<{
      id: string
      active: boolean
      type: string
      recurring: unknown
      currency: string
      unit_amount: number | null
    }>
  }
}

/**
 * Parses STRIPE_PACK_PRICE_CONFIG, then RETRIEVES every configured Price
 * from Stripe (never inferring mode/validity from the Price ID string
 * alone) and verifies each is active, one-time (not recurring), in the
 * expected currency, and for the expected amount. A Price ID that belongs
 * to a different Stripe mode/account than the provided client's key fails
 * here too -- Stripe's own API returns "no such price" for a cross-mode
 * retrieval, which this function treats as a verification failure like any
 * other, not a special case to detect separately.
 */
export async function loadAndVerifyPriceConfig(
  stripe: StripePriceRetriever,
  rawConfig: string | undefined,
): Promise<VerifiedPriceConfig> {
  const parsed = parseRawConfig(rawConfig)
  const verified: VerifiedPriceConfig = {}

  for (const [priceId, expected] of Object.entries(parsed)) {
    let price
    try {
      price = await stripe.prices.retrieve(priceId)
    } catch {
      throw new Error(
        `price_not_retrievable: ${priceId} could not be retrieved from Stripe (wrong mode, wrong account, or does not exist)`,
      )
    }
    if (!price.active) {
      throw new Error(`price_inactive: ${priceId} is not active`)
    }
    if (price.type !== 'one_time' || price.recurring) {
      throw new Error(`price_is_recurring: ${priceId} is not a one-time Price`)
    }
    if (price.currency.toLowerCase() !== expected.expectedCurrency) {
      throw new Error(
        `price_currency_mismatch: ${priceId} is ${price.currency}, expected ${expected.expectedCurrency}`,
      )
    }
    if (price.unit_amount !== expected.expectedAmount) {
      throw new Error(
        `price_amount_mismatch: ${priceId} is ${price.unit_amount}, expected ${expected.expectedAmount}`,
      )
    }
    verified[priceId] = expected
  }

  return verified
}

// Per-instance cache: verification does real Stripe API calls, so it runs
// once per cold start (not once per request) and is reused for the
// instance's lifetime. A failed verification is NOT cached -- the next
// request gets a fresh attempt, in case the failure was transient (a
// Stripe API outage) rather than a genuine configuration error.
let cachedConfigPromise: Promise<VerifiedPriceConfig> | null = null

export function getVerifiedPriceConfig(
  stripe: StripePriceRetriever,
): Promise<VerifiedPriceConfig> {
  if (!cachedConfigPromise) {
    cachedConfigPromise = loadAndVerifyPriceConfig(
      stripe,
      Deno.env.get('STRIPE_PACK_PRICE_CONFIG'),
    ).catch((error) => {
      cachedConfigPromise = null
      throw error
    })
  }
  return cachedConfigPromise
}

export function priceIdForPack(
  config: VerifiedPriceConfig,
  packId: 'small' | 'medium' | 'large',
): string | null {
  for (const [priceId, entry] of Object.entries(config)) {
    if (entry.packId === packId) return priceId
  }
  return null
}

// Test-only escape hatch: allows a unit test to reset the module-level
// cache between cases. Never called from production code paths.
export function _resetCacheForTests(): void {
  cachedConfigPromise = null
}
