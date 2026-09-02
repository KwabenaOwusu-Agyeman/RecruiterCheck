// Run with: npx tsx supabase/functions/stripe-webhook/index.test.ts
//
// index.ts opens a server and pulls Stripe's SDK over a Deno npm: specifier,
// so it cannot be invoked under tsx. This is a source-level regression guard,
// the same technique send-welcome-email/index.test.ts uses, plus a config
// guard over supabase/config.toml.
//
// It exists because this function is the one place where Supabase's gateway
// JWT check is deliberately off. That is only safe while the function does its
// own request authentication, so every property that makes it safe is asserted
// here and fails loudly if a future edit removes one.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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

const source = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf-8')
const config = readFileSync(fileURLToPath(new URL('../../config.toml', import.meta.url)), 'utf-8')
const at = (needle: string) => source.indexOf(needle)

/**
 * Slice between two anchors, with the end always searched for AFTER the start.
 * A plain indexOf for the end anchor can match earlier in the file and yield an
 * empty slice, which makes every assertion on it pass vacuously. Both anchors
 * must be present.
 */
function between(startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle)
  assert.ok(start !== -1, `anchor not found: ${startNeedle}`)
  const end = source.indexOf(endNeedle, start + startNeedle.length)
  assert.ok(end !== -1, `end anchor not found after start: ${endNeedle}`)
  return source.slice(start, end)
}

// ---------------------------------------------------------------------------
// A missing Stripe-Signature fails
// ---------------------------------------------------------------------------

test('a missing Stripe-Signature is rejected before any processing', () => {
  assert.match(source, /const signature = req\.headers\.get\('stripe-signature'\)/)
  assert.match(source, /if \(!signature\)\s*\{\s*\n\s*return new Response\('Missing stripe-signature header', \{\s*status: 400/)
})

// ---------------------------------------------------------------------------
// An invalid Stripe-Signature fails
// ---------------------------------------------------------------------------

test('the signature is verified against STRIPE_WEBHOOK_SECRET', () => {
  assert.match(source, /Deno\.env\.get\('STRIPE_WEBHOOK_SECRET'\)/)
  assert.match(source, /constructEventAsync\(rawBody, signature, webhookSecret\)/)
})

test('verification is wrapped so a bad signature fails closed with 400', () => {
  // The call must sit in a try/catch whose catch returns, never falls through.
  const block = between('let event: Stripe.Event', 'const supabaseUrl')
  assert.match(block, /try \{/)
  assert.match(block, /catch \(error\)/)
  assert.match(block, /return new Response\('Invalid signature', \{ status: 400 \}\)/)
})

test('the signed payload is the raw body, not a re-serialised object', () => {
  // Parsing and re-stringifying changes the bytes and silently breaks
  // verification, the classic way this check gets defeated.
  assert.match(source, /const rawBody = await req\.text\(\)/)
  assert.ok(!source.includes('await req.json()'), 'must not parse the body before verifying')
  assert.ok(at('const rawBody = await req.text()') < at('constructEventAsync'))
})

test('the function is unconfigured-safe: no key or secret means 503, not open', () => {
  assert.match(source, /if \(!stripeSecretKey \|\| !webhookSecret\)/)
  assert.match(source, /return new Response\('Billing is not configured', \{ status: 503 \}\)/)
})

// ---------------------------------------------------------------------------
// A valid signed webhook reaches processing
// ---------------------------------------------------------------------------

test('only the recording step may short-circuit a verified event', () => {
  // Asserting which returns are allowed rather than how many, so adding an
  // intended branch does not fail while an unintended one still does.
  const afterVerify = between('const supabaseUrl', 'switch (event.type)')
  const ALLOWED = [
    "return new Response('Could not record event', { status: 500 })",
    "return new Response(JSON.stringify({ received: true, duplicate: true }), {",
  ]
  const returns = afterVerify.match(/return new Response[^\n]*/g) ?? []
  for (const r of returns) {
    assert.ok(
      ALLOWED.some((a) => r.startsWith(a.slice(0, 40))),
      `unexpected early return between verification and processing: ${r.trim()}`,
    )
  }
  assert.match(afterVerify, /stripe_webhook_events/)
})

test('a verified checkout.session.completed is handled', () => {
  assert.match(source, /case 'checkout\.session\.completed':/)
  assert.match(source, /handlePackCheckoutCompleted\(\s*\n?\s*adminClient,\s*\n?\s*stripe,/)
  assert.ok(at('constructEventAsync') < at("case 'checkout.session.completed':"))
})

test('privileged credentials are only reached after verification', () => {
  // The service-role client must never be constructed on an unverified request.
  assert.ok(at('constructEventAsync') < at('SUPABASE_SERVICE_ROLE_KEY'))
  assert.ok(at("return new Response('Invalid signature'") < at('SUPABASE_SERVICE_ROLE_KEY'))
})

// ---------------------------------------------------------------------------
// No Supabase Authorization header is required by the handler
// ---------------------------------------------------------------------------

test('the handler never reads a Supabase Authorization header or JWT', () => {
  for (const forbidden of ['Authorization', 'authHeader', 'auth.getUser', 'SUPABASE_ANON_KEY']) {
    assert.ok(!source.includes(forbidden), `handler must not depend on ${forbidden}`)
  }
})

test('config.toml turns the gateway JWT check off for stripe-webhook', () => {
  assert.match(config, /\[functions\.stripe-webhook\]\s*\nverify_jwt = false/)
})

// ---------------------------------------------------------------------------
// The exception is narrow
// ---------------------------------------------------------------------------

test('no other function had its verify_jwt setting changed', () => {
  const EXPECTED: Record<string, string> = {
    'analyze-check': 'true',
    'create-checkout-session': 'true',
    // The browser extension redeems a connect code before it has a session,
    // so there is no JWT to present; the function authenticates the code
    // itself. Production has run it unverified since it was created, and
    // the config entry was added so an automated deploy cannot switch the
    // gateway check on and lock the extension out.
    'exchange-extension-connect-code': 'false',
    'stripe-webhook': 'false',
    'newsletter-subscribe': 'false',
    'send-welcome-email': 'true',
    'send-password-changed-email': 'false',
    'newsletter-unsubscribe': 'false',
    'instagram-oauth-start': 'false',
    'instagram-oauth-callback': 'false',
    'instagram-mcp': 'false',
    'brevo-unsubscribe-webhook': 'false',
    // pg_cron target authenticated by its own x-cron-secret check, which
    // fails closed when the secret is unset. See its index.ts header.
    'reconcile-ambiguous-refunds': 'false',
  }
  const found: Record<string, string> = {}
  for (const m of config.matchAll(/\[functions\.([a-z-]+)\]\s*\nverify_jwt\s*=\s*(true|false)/g)) {
    found[m[1]] = m[2]
  }
  assert.deepEqual(found, EXPECTED, 'a verify_jwt setting changed unexpectedly')
})

test('stripe-webhook is the only Stripe function with the gateway check off', () => {
  const stripeFns = ['create-checkout-session', 'request-refund', 'delete-account']
  for (const fn of stripeFns) {
    const m = config.match(new RegExp(`\\[functions\\.${fn}\\]\\s*\\nverify_jwt\\s*=\\s*(true|false)`))
    if (m) assert.equal(m[1], 'true', `${fn} must keep the gateway JWT check on`)
  }
})

// ---------------------------------------------------------------------------
// The stripe_webhook_events insert must satisfy the live schema
//
// The original production failure: the Part A migration made event_type NOT
// NULL with no default, the insert still supplied only id, Postgres raised
// 23502, and the dedupe branch only recognised 23505 — so every delivery
// returned 500 and no purchase was ever fulfilled. These tests exist so that
// schema/insert drift fails here instead of in production.
// ---------------------------------------------------------------------------

const insertCall = source.slice(at("from('stripe_webhook_events')"), at('if (dedupeError)'))

function insertKeys(): string[] {
  const m = insertCall.match(/\.insert\(\{([^}]*)\}\)/)
  assert.ok(m, 'could not locate the stripe_webhook_events insert')
  return m[1]
    .split(',')
    .map((part) => part.split(':')[0].trim())
    .filter(Boolean)
    .sort()
}

test('the insert supplies event_type', () => {
  assert.match(insertCall, /event_type: event\.type/)
})

test('the insert supplies exactly id and event_type', () => {
  assert.deepEqual(insertKeys(), ['event_type', 'id'])
})

test('the insert covers every NOT NULL column that has no default', () => {
  // Derived from the tracked migrations rather than restated, so adding
  // another required column to the table fails this test until the insert
  // is updated to match.
  const migrations = fileURLToPath(new URL('../../migrations/', import.meta.url))
  const createSql = readFileSync(migrations + '20260825024217_check_pack_system.sql', 'utf-8')
  const partASql = readFileSync(
    migrations + '20260828064817_part_a_keyword_scan_credits_and_refund_integrity.sql',
    'utf-8',
  )

  const required = new Set<string>()
  const optional = new Set<string>()

  const classify = (name: string, decl: string) => {
    const notNull = /\bnot null\b/i.test(decl) || /\bprimary key\b/i.test(decl)
    const hasDefault = /\bdefault\b/i.test(decl)
    if (notNull && !hasDefault) required.add(name)
    else optional.add(name)
  }

  // Base table.
  const createBlock = createSql.match(
    /create table if not exists public\.stripe_webhook_events \(([\s\S]*?)\n\);/,
  )
  assert.ok(createBlock, 'could not locate the create table statement')
  for (const line of createBlock[1].split('\n')) {
    const m = line.trim().match(/^([a-z_]+)\s+(.+?),?$/i)
    if (m) classify(m[1], m[2])
  }

  // Columns added later.
  const addBlock = partASql.match(
    /alter table public\.stripe_webhook_events\n([\s\S]*?);/,
  )
  assert.ok(addBlock, 'could not locate the add column statement')
  for (const m of addBlock[1].matchAll(/add column if not exists ([a-z_]+)\s+([^,\n]+)/g)) {
    classify(m[1], m[2])
  }

  // NOT NULL applied after the fact, to a column with no default.
  for (const m of partASql.matchAll(
    /alter table public\.stripe_webhook_events alter column ([a-z_]+) set not null/g,
  )) {
    optional.delete(m[1])
    required.add(m[1])
  }

  assert.ok(required.has('event_type'), 'expected event_type to be a required column')
  const supplied = new Set(insertKeys())
  const missing = [...required].filter((c) => !supplied.has(c))
  assert.deepEqual(
    missing,
    [],
    `insert is missing NOT NULL column(s) with no default: ${missing.join(', ')}`,
  )
})

// ---------------------------------------------------------------------------
// Dedupe behaviour must not regress
// ---------------------------------------------------------------------------

test('only a COMPLETED event is treated as a duplicate', () => {
  // The row is written before fulfilment runs, so its existence alone does not
  // mean the event was handled. Returning duplicate on a merely-recorded event
  // makes a failed event permanently unprocessable.
  const block = between('if (dedupeError)', 'async function markEvent')
  assert.match(block, /existing\?\.status === 'completed'/)
  assert.ok(
    block.indexOf("existing?.status === 'completed'") < block.indexOf('duplicate: true'),
    'the duplicate response must be gated on completed status',
  )
})

test('a recorded but incomplete event is reprocessed, not skipped', () => {
  const block = between('if (dedupeError)', 'async function markEvent')
  assert.match(block, /reprocessing an event that never completed/)
  // No early return between the status check and the processing switch.
  const afterStatusCheck = between('reprocessing an event that never completed', 'switch (event.type)')
  assert.ok(!afterStatusCheck.includes('return new Response'), 'reprocessing must fall through to the switch')
})

test('a non-unique database error still fails with 500', () => {
  const block = between('if (dedupeError)', 'async function markEvent')
  assert.match(block, /dedupeError\.code !== '23505'/)
  assert.match(block, /return new Response\('Could not record event', \{ status: 500 \}\)/)
})

test('the event is marked completed only when a handler actually fulfilled', () => {
  assert.ok(at('switch (event.type)') < at("markEvent(adminClient, event.id, 'completed')"))
  assert.match(source, /if \(outcome === 'fulfilled'\) \{\s*\n\s*await markEvent\(adminClient, event\.id, 'completed'\)/)
})

test('a skipped event is left reprocessable rather than closed', () => {
  const tail = between("if (outcome === 'fulfilled')", 'return new Response')
  assert.match(tail, /left reprocessable/)
  assert.ok(!/else \{[^}]*markEvent\([^)]*'completed'/.test(tail), 'a skip must not mark completed')
})

test('the outcome defaults to skipped, so a missed branch cannot close an event', () => {
  assert.match(source, /let outcome: HandlerOutcome = 'skipped'/)
})

test('a failed fulfilment is marked failed and stays reprocessable', () => {
  assert.match(source, /markEvent\(adminClient, event\.id, 'failed', 'fulfilment_error'\)/)
  // 'failed' is not 'completed', so the dedupe branch will reprocess it.
  assert.ok(!/markEvent\([^)]*'failed'[^)]*'completed'/.test(source))
})

test('error_category carries a sanitised category, never a raw error', () => {
  const marked = source.match(/markEvent\(adminClient, event\.id, 'failed', '([^']+)'\)/)
  assert.ok(marked, 'no failure marking found')
  assert.match(marked[1], /^[a-z_]+$/, 'error_category must be a fixed snake_case category')
  assert.ok(!/error_category:[^\n]*error\.message/.test(source))
})

test('fulfilment never runs on a record that could not be written', () => {
  assert.ok(at('Could not record event') < at('switch (event.type)'))
})

// ---------------------------------------------------------------------------
// Pack fulfilment must satisfy the credit_batches purchase constraints
//
// Part A (20260828064817) added credit_batches_purchase_verified_facts_check
// and credit_batches_purchase_expiry_check. The webhook kept calling the older
// grant_check_credits, which cannot populate those columns, so every purchase
// failed with 23514 and no order was ever fulfilled. These tests derive the
// requirement from the migration so the same drift fails here next time.
// ---------------------------------------------------------------------------

const rpcCall = between("adminClient.rpc('grant_pack_credits'", 'if (error)')

test('fulfilment calls grant_pack_credits, not the superseded grant_check_credits', () => {
  assert.match(source, /adminClient\.rpc\('grant_pack_credits'/)
  assert.ok(!source.includes("grant_check_credits"), 'the superseded RPC must not be called')
})

test('the RPC supplies every fact the purchase constraint requires', () => {
  const migrations = fileURLToPath(new URL('../../migrations/', import.meta.url))
  const partASql = readFileSync(
    migrations + '20260828064817_part_a_keyword_scan_credits_and_refund_integrity.sql',
    'utf-8',
  )
  const constraint = partASql.match(
    /add constraint credit_batches_purchase_verified_facts_check\s*\n?\s*check \(([\s\S]*?)\)\);/,
  )
  assert.ok(constraint, 'could not locate credit_batches_purchase_verified_facts_check')

  const required = [...constraint[1].matchAll(/([a-z_]+) is not null/g)].map((m) => m[1])
  assert.ok(required.length >= 5, `expected several required facts, found ${required.length}`)

  for (const column of required) {
    const param = `p_${column}:`
    assert.ok(rpcCall.includes(param), `grant_pack_credits call is missing ${param}`)
    assert.ok(
      !new RegExp(`${param}\\s*null`).test(rpcCall),
      `${param} must not be hard-coded null`,
    )
  }
})

test('the session is retrieved with the fields the event payload lacks', () => {
  // price id, quantity and the charge are not in the webhook payload; they are
  // fetched, never inferred or defaulted.
  assert.match(source, /stripe\.checkout\.sessions\.retrieve\(/)
  assert.match(source, /expand: \['line_items', 'payment_intent\.latest_charge'\]/)
})

test('paid_at comes from the charge and is never substituted', () => {
  // grant_pack_credits compares paid_at on replay, so a value that shifts
  // between redeliveries would raise fulfilment_conflict on every retry.
  assert.match(source, /charge\?\.created \? new Date\(charge\.created \* 1000\)/)
  assert.ok(!/paidAt[^\n]*Date\.now\(\)/.test(source), 'paid_at must not use Date.now()')
  assert.ok(!/p_paid_at:[^\n]*\?\?/.test(rpcCall), 'paid_at must not have a fallback')
})

test('payment status is judged on the LIVE session, not the frozen payload', () => {
  // The payload's payment_status is fixed at event time. A session can complete
  // unpaid and settle later, so deciding from the snapshot permanently drops
  // the order. The retrieve must come first and the check must read from it.
  assert.ok(
    at('stripe.checkout.sessions.retrieve') < at("full.payment_status !== 'paid'"),
    'the retrieve must precede the payment status check',
  )
  assert.match(source, /full\.payment_status !== 'paid'/)
  assert.ok(
    !/if \(session\.payment_status !== 'paid'\)/.test(source),
    'must not gate fulfilment on the frozen payload payment_status',
  )
})

test('an unpaid session is skipped, not thrown and not completed', () => {
  const guard = between("full.payment_status !== 'paid'", 'const lineItem')
  assert.match(guard, /return 'skipped'/)
  assert.ok(!guard.includes('throw'), 'an unpaid session must not trigger retries')
})

test('a settled async payment fulfils through the same handler', () => {
  // Without this case the settlement event is recorded, no-ops, and the paid
  // order is silently dropped.
  assert.match(source, /case 'checkout\.session\.completed':\s*\n\s*case 'checkout\.session\.async_payment_succeeded':/)
})

test('every handler branch returns an explicit outcome', () => {
  // A bare `return` inside a handler would be treated as success by the caller.
  for (const fn of ['handlePackCheckoutCompleted', 'handleChargeRefunded']) {
    const start = source.indexOf(`async function ${fn}`)
    assert.ok(start !== -1, `${fn} not found`)
    const body = source.slice(start, source.indexOf('\n}', start))
    const bareReturns = body.match(/^\s*return\s*$/gm) ?? []
    assert.equal(bareReturns.length, 0, `${fn} has a bare return that reads as success`)
  }
})

test('missing verified facts throw so Stripe retries rather than dropping the order', () => {
  assert.match(source, /missing_verified_purchase_facts/)
  assert.ok(at('missing.length > 0') < at("adminClient.rpc('grant_pack_credits'"))
})

// ---------------------------------------------------------------------------
// External refunds go through the state machine, not a hand-written clawback
//
// The old inline clawback touched only checks, never set refund_status, and
// wrote no refund_events row. None of that errors, so it left silently wrong
// state. recover_external_refund exists for this exact path and ends in the
// same state as the self-service flow.
// ---------------------------------------------------------------------------

test('the refund handler delegates to recover_external_refund', () => {
  assert.match(source, /adminClient\.rpc\('recover_external_refund', \{/)
  assert.match(source, /p_stripe_payment_intent_id: paymentIntentId/)
  assert.match(source, /p_stripe_refund_id: stripeRefundId/)
})

test('the refund handler writes no credit state by hand', () => {
  // Any direct write here would bypass the lock order, the refund_events audit
  // trail, and the per-credit-type ledger legs that finalize_refund writes.
  const body = between('async function handleChargeRefunded', '\n}')
  for (const forbidden of ["from('credit_batches')", "from('profiles')", "from('check_ledger')"]) {
    assert.ok(!body.includes(forbidden), `refund handler must not write ${forbidden} directly`)
  }
  assert.ok(!body.includes('checks_remaining'), 'clawback arithmetic must live in the RPC')
})

test('it passes a Stripe Refund id, never the charge id', () => {
  // refund_events.stripe_refund_id must be a re_ id; the column comment says so.
  const body = between('async function handleChargeRefunded', '\n}')
  assert.match(body, /stripe\.refunds\.list\(\{ payment_intent: paymentIntentId/)
  assert.match(body, /const stripeRefundId = refunds\.data\[0\]\?\.id/)
  assert.ok(!/p_stripe_refund_id: charge\.id/.test(body))
})

test('a missing refund is skipped rather than finalised against nothing', () => {
  const body = between('async function handleChargeRefunded', '\n}')
  assert.match(body, /if \(!stripeRefundId\) \{[\s\S]*?return 'skipped'/)
})

test('every recover_external_refund outcome is classified', () => {
  const body = between('async function handleChargeRefunded', '\n}')
  for (const outcome of ['finalized', 'already_finalized', 'already_refunded', 'batch_not_found']) {
    assert.ok(body.includes(`case '${outcome}'`), `unhandled outcome: ${outcome}`)
  }
  // An unrecognised outcome must not be treated as done.
  assert.match(body, /default:[\s\S]*?return 'skipped'/)
})

console.log(`\n${passed} tests passed`)
