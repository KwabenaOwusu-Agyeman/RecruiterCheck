import {
  assertEquals,
  assertRejects,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  assertSecretKeyMatchesEnvironment,
  getStripeEnvironment,
  loadAndVerifyPriceConfig,
  type StripePriceRetriever,
} from './price-config.ts'

const VALID_RAW_CONFIG = JSON.stringify({
  'price_small_001': {
    packId: 'small',
    expectedAmount: 1000,
    expectedCurrency: 'eur',
  },
  'price_medium_001': {
    packId: 'medium',
    expectedAmount: 2000,
    expectedCurrency: 'eur',
  },
  'price_large_001': {
    packId: 'large',
    expectedAmount: 4000,
    expectedCurrency: 'eur',
  },
})

function mockStripe(
  prices: Record<string, {
    active: boolean
    type: string
    recurring: unknown
    currency: string
    unit_amount: number | null
  }>,
): StripePriceRetriever {
  return {
    prices: {
      retrieve(id: string) {
        const price = prices[id]
        if (!price) {
          return Promise.reject(new Error(`no such price: ${id}`))
        }
        return Promise.resolve({ id, ...price })
      },
    },
  }
}

function validMockPrices(): Record<string, {
  active: boolean
  type: string
  recurring: unknown
  currency: string
  unit_amount: number | null
}> {
  return {
    'price_small_001': {
      active: true,
      type: 'one_time',
      recurring: null,
      currency: 'eur',
      unit_amount: 1000,
    },
    'price_medium_001': {
      active: true,
      type: 'one_time',
      recurring: null,
      currency: 'eur',
      unit_amount: 2000,
    },
    'price_large_001': {
      active: true,
      type: 'one_time',
      recurring: null,
      currency: 'eur',
      unit_amount: 4000,
    },
  }
}

Deno.test('T-PRICE-1: missing environment throws', () => {
  const original = Deno.env.get('STRIPE_ENVIRONMENT')
  Deno.env.delete('STRIPE_ENVIRONMENT')
  try {
    assertThrows(
      () => getStripeEnvironment(),
      Error,
      'invalid_stripe_environment',
    )
  } finally {
    if (original !== undefined) Deno.env.set('STRIPE_ENVIRONMENT', original)
  }
})

Deno.test('T-PRICE-2: live key in test environment throws', () => {
  assertThrows(
    () => assertSecretKeyMatchesEnvironment('sk_live_abc123', 'test'),
    Error,
    'stripe_key_environment_mismatch',
  )
})

Deno.test('T-PRICE-2b: test key in production environment throws (converse case)', () => {
  assertThrows(
    () => assertSecretKeyMatchesEnvironment('sk_test_abc123', 'production'),
    Error,
    'stripe_key_environment_mismatch',
  )
})

Deno.test('T-PRICE-2c: a correctly matched key/environment pair does not throw', () => {
  assertSecretKeyMatchesEnvironment('sk_test_abc123', 'test')
  assertSecretKeyMatchesEnvironment('sk_live_abc123', 'production')
})

Deno.test('T-PRICE-3: malformed config (invalid JSON) throws', async () => {
  const stripe = mockStripe(validMockPrices())
  await assertRejects(
    () => loadAndVerifyPriceConfig(stripe, '{not valid json'),
    Error,
    'malformed_price_config',
  )
})

Deno.test('T-PRICE-3b: malformed config (missing entirely) throws', async () => {
  const stripe = mockStripe(validMockPrices())
  await assertRejects(
    () => loadAndVerifyPriceConfig(stripe, undefined),
    Error,
    'missing_price_config',
  )
})

Deno.test('T-PRICE-4: duplicate prices for the same pack throws', async () => {
  const stripe = mockStripe(validMockPrices())
  const dup = JSON.stringify({
    'price_small_001': {
      packId: 'small',
      expectedAmount: 1000,
      expectedCurrency: 'eur',
    },
    'price_small_002': {
      packId: 'small',
      expectedAmount: 1000,
      expectedCurrency: 'eur',
    },
    'price_large_001': {
      packId: 'large',
      expectedAmount: 4000,
      expectedCurrency: 'eur',
    },
  })
  await assertRejects(
    () => loadAndVerifyPriceConfig(stripe, dup),
    Error,
    'malformed_price_config',
  )
})

Deno.test('T-PRICE-5: wrong amount (mismatch vs live Stripe Price) throws', async () => {
  const prices = validMockPrices()
  prices['price_small_001'].unit_amount = 999
  const stripe = mockStripe(prices)
  await assertRejects(
    () => loadAndVerifyPriceConfig(stripe, VALID_RAW_CONFIG),
    Error,
    'price_amount_mismatch',
  )
})

Deno.test('T-PRICE-6: wrong currency (mismatch vs live Stripe Price) throws', async () => {
  const prices = validMockPrices()
  prices['price_small_001'].currency = 'usd'
  const stripe = mockStripe(prices)
  await assertRejects(
    () => loadAndVerifyPriceConfig(stripe, VALID_RAW_CONFIG),
    Error,
    'price_currency_mismatch',
  )
})

Deno.test('T-PRICE-7: recurring Price throws', async () => {
  const prices = validMockPrices()
  prices['price_small_001'].type = 'recurring'
  prices['price_small_001'].recurring = { interval: 'month' }
  const stripe = mockStripe(prices)
  await assertRejects(
    () => loadAndVerifyPriceConfig(stripe, VALID_RAW_CONFIG),
    Error,
    'price_is_recurring',
  )
})

Deno.test('T-PRICE-8: inactive Price throws', async () => {
  const prices = validMockPrices()
  prices['price_small_001'].active = false
  const stripe = mockStripe(prices)
  await assertRejects(
    () => loadAndVerifyPriceConfig(stripe, VALID_RAW_CONFIG),
    Error,
    'price_inactive',
  )
})

Deno.test('T-PRICE-9: a fully valid config verifies successfully and preserves the expected shape', async () => {
  const stripe = mockStripe(validMockPrices())
  const result = await loadAndVerifyPriceConfig(stripe, VALID_RAW_CONFIG)
  assertEquals(Object.keys(result).length, 3)
  assertEquals(result['price_small_001'].packId, 'small')
  assertEquals(result['price_medium_001'].packId, 'medium')
  assertEquals(result['price_large_001'].packId, 'large')
})

Deno.test('T-PRICE-10: a Price ID from a different Stripe mode/account (retrieve fails) is treated as a verification failure', async () => {
  const prices = validMockPrices()
  // deno-lint-ignore no-explicit-any
  delete (prices as any)['price_small_001']
  const stripe = mockStripe(prices)
  await assertRejects(
    () => loadAndVerifyPriceConfig(stripe, VALID_RAW_CONFIG),
    Error,
    'price_not_retrievable',
  )
})
