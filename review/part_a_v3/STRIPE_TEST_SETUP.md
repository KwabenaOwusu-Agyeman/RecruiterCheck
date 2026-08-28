# Stripe test-mode setup for `myrecruitercheck-scoring-test`

**I have not created any of these — I have no Stripe Dashboard access.** This is the exact list of what you need to create, and what I cannot invent (real Price IDs).

## 1. Products and Prices to create, in Stripe **test mode**

Create three one-time Products, each with one Price:

| Product name | Price | Currency | Type |
|---|---|---|---|
| Starter Check Pack (test) | €10.00 (1000 minor units) | EUR | one-time |
| Active Check Pack (test) | €20.00 (2000 minor units) | EUR | one-time |
| Power Check Pack (test) | €40.00 (4000 minor units) | EUR | one-time |

These amounts must exactly match `expectedAmount`/`expectedCurrency` in `edge-functions/price-config.ts`'s `STRIPE_PACK_PRICE_CONFIG` value for the test project — a mismatch causes `stripe-webhook.ts` to classify the checkout as `permanently_invalid` by design (Item F).

## 2. Environment variable / secret names (on the test project's Edge Function secrets)

```
STRIPE_ENVIRONMENT=test
STRIPE_SECRET_KEY=sk_test_...          (test-mode secret key, from Stripe Dashboard > Developers > API keys, TEST MODE toggle on)
STRIPE_WEBHOOK_SECRET=whsec_...        (test-mode webhook signing secret, from the test-mode webhook endpoint you create)
STRIPE_PACK_PRICE_CONFIG={"price_XXXXXXXXXXXXXXXXtest_small":{"packId":"small","expectedAmount":1000,"expectedCurrency":"eur"},"price_XXXXXXXXXXXXXXXXtest_medium":{"packId":"medium","expectedAmount":2000,"expectedCurrency":"eur"},"price_XXXXXXXXXXXXXXXXtest_large":{"packId":"large","expectedAmount":4000,"expectedCurrency":"eur"}}
```

Replace every `price_XXXXXXXXXXXXXXXXtest_*` placeholder with the **actual test-mode Price IDs** Stripe generates when you create the three Prices above — I do not have these and have not guessed at any value.

## 3. Test-mode verification (before trusting any test-project run)

```bash
# Confirm the secret key is genuinely test-mode (starts with sk_test_, not sk_live_)
echo $STRIPE_SECRET_KEY | grep -q '^sk_test_' && echo "OK: test key" || echo "DANGER: not a test key"
```

`create-checkout-session.ts` and `stripe-webhook.ts` both read `STRIPE_ENVIRONMENT` purely for logging/error messages — they do **not** currently enforce that `STRIPE_SECRET_KEY` matches `STRIPE_ENVIRONMENT`. **This is a gap, flagged here rather than silently left:** add an explicit guard (proposed, not yet implemented):

```ts
if (Deno.env.get('STRIPE_ENVIRONMENT') === 'test' && !stripeSecretKey.startsWith('sk_test_')) {
  console.error('Refusing to start: STRIPE_ENVIRONMENT=test but STRIPE_SECRET_KEY is not a test-mode key')
  return new Response('Billing configuration invalid', { status: 503 })
}
if (Deno.env.get('STRIPE_ENVIRONMENT') === 'production' && !stripeSecretKey.startsWith('sk_live_')) {
  console.error('Refusing to start: STRIPE_ENVIRONMENT=production but STRIPE_SECRET_KEY is not a live key')
  return new Response('Billing configuration invalid', { status: 503 })
}
```

This guard is **not yet added to the candidate edge function files in this package** — noted as an outstanding item in `V4_SUMMARY.md`, not silently claimed done.

## 4. Webhook endpoint (test mode)

In Stripe Dashboard, test mode: Developers > Webhooks > Add endpoint. URL: `https://<test-project-ref>.supabase.co/functions/v1/stripe-webhook`. Events to send: `checkout.session.completed`, `charge.refunded`. Copy the resulting signing secret into `STRIPE_WEBHOOK_SECRET` on the test project.

## 5. Steps you must perform in the Stripe Dashboard (I cannot do these)

1. Switch to **Test mode** (toggle, top of Dashboard).
2. Create the three Products/Prices from §1.
3. Copy the three test-mode Price IDs into `STRIPE_PACK_PRICE_CONFIG` (§2).
4. Create the test-mode webhook endpoint (§4) and copy its signing secret.
5. Copy the test-mode secret key (`sk_test_...`) into the test project's `STRIPE_SECRET_KEY` secret.
6. Confirm the test project's Checkout is genuinely reachable only in test mode (test-mode Checkout Sessions show a "TEST MODE" banner — visually confirm this on first canary purchase).

## 6. Guard against live keys/Price IDs reaching the test project

Beyond the `sk_test_`/`sk_live_` prefix check in §3, add a second guard (also not yet implemented, flagged): reject any `STRIPE_PACK_PRICE_CONFIG` Price ID that doesn't match Stripe's test-mode ID pattern is not reliably possible from the ID string alone (Stripe doesn't prefix Price IDs by mode) — the **prefix-checked secret key is the actual enforcement boundary**, since a test-mode secret key can only ever create/read test-mode Checkout Sessions and will reject a live-mode Price ID outright with a Stripe API error (caught by the existing try/catch in `create-checkout-session.ts`, surfaced as a 500). This is Stripe's own cross-mode isolation, not something this codebase needs to separately re-implement — confirmed by Stripe's documented behavior, not independently tested against a real API call in this session (no test-mode key exists yet to test with).
