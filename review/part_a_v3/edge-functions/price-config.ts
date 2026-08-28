// Shared by stripe-webhook and create-checkout-session. Item F/28:
// environment-specific Stripe configuration, entirely from secrets -- never
// a hardcoded literal shared between the production and test Supabase
// projects. Each project sets its OWN STRIPE_PACK_PRICE_CONFIG secret,
// pointing at its own Stripe mode (production -> live Price IDs, test
// project -> Stripe TEST-mode Price IDs from a separate test catalog).
// Fails closed (returns null) on any missing/malformed configuration --
// every caller must explicitly check for null before proceeding.

export const ENVIRONMENT_LABEL = Deno.env.get('STRIPE_ENVIRONMENT') ?? 'unset'

export interface PackPriceEntry {
  packId: 'small' | 'medium' | 'large'
  expectedAmount: number
  expectedCurrency: string
}

function loadPriceMap(): Record<string, PackPriceEntry> | null {
  const raw = Deno.env.get('STRIPE_PACK_PRICE_CONFIG')
  if (!raw) {
    console.error(
      'STRIPE_PACK_PRICE_CONFIG is not set for this environment:',
      ENVIRONMENT_LABEL,
    )
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    console.error(
      'STRIPE_PACK_PRICE_CONFIG is not valid JSON for this environment:',
      ENVIRONMENT_LABEL,
    )
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const entries = Object.entries(parsed as Record<string, unknown>)
  if (entries.length !== 3) {
    console.error(
      'STRIPE_PACK_PRICE_CONFIG does not have exactly 3 pack entries:',
      ENVIRONMENT_LABEL,
    )
    return null
  }
  const packIds = new Set<string>()
  for (const [priceId, entry] of entries) {
    if (
      typeof entry !== 'object' || entry === null ||
      typeof (entry as PackPriceEntry).packId !== 'string' ||
      !['small', 'medium', 'large'].includes(
        (entry as PackPriceEntry).packId,
      ) ||
      typeof (entry as PackPriceEntry).expectedAmount !== 'number' ||
      typeof (entry as PackPriceEntry).expectedCurrency !== 'string' ||
      !priceId.startsWith('price_')
    ) {
      console.error(
        'STRIPE_PACK_PRICE_CONFIG entry malformed for price',
        priceId,
      )
      return null
    }
    packIds.add((entry as PackPriceEntry).packId)
  }
  if (packIds.size !== 3) {
    console.error(
      'STRIPE_PACK_PRICE_CONFIG does not cover exactly small/medium/large once each',
    )
    return null
  }
  return parsed as Record<string, PackPriceEntry>
}

export const PACK_PRICE_MAP: Record<string, PackPriceEntry> | null =
  loadPriceMap()

// Reverse lookup, used by create-checkout-session (packId -> priceId).
export function priceIdForPack(
  packId: 'small' | 'medium' | 'large',
): string | null {
  if (!PACK_PRICE_MAP) return null
  for (const [priceId, entry] of Object.entries(PACK_PRICE_MAP)) {
    if (entry.packId === packId) return priceId
  }
  return null
}
