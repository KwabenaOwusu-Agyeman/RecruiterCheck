// Run with: npx tsx supabase/functions/request-refund/index.test.ts
//
// index.ts issues a real Stripe refund and drives Supabase end to end, so it
// cannot be invoked under tsx. This is a source-level regression guard, the
// same technique send-welcome-email and stripe-webhook use.
//
// It exists because this function moves real money and then writes the state
// that reflects it. It cannot fail loudly: nothing here violates a constraint,
// so a gap shows up as silently wrong data rather than an error.
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
const at = (needle: string) => source.indexOf(needle)

function between(startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle)
  assert.ok(start !== -1, `anchor not found: ${startNeedle}`)
  const end = source.indexOf(endNeedle, start + startNeedle.length)
  assert.ok(end !== -1, `end anchor not found after start: ${endNeedle}`)
  return source.slice(start, end)
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

test('the batch query selects both credit types and the refund status', () => {
  const select = between(".from('credit_batches')", '.eq(')
  for (const column of [
    'checks_granted',
    'checks_remaining',
    'keyword_scans_granted',
    'keyword_scans_remaining',
    'refund_status',
  ]) {
    assert.ok(select.includes(column), `eligibility cannot be judged without ${column}`)
  }
})

test('an already-refunded batch is rejected before any Stripe call', () => {
  assert.match(source, /batch\.refund_status !== 'active'/)
  assert.ok(at("batch.refund_status !== 'active'") < at('stripe.refunds.create'))
})

test('"untouched" considers keyword scans, not only checks', () => {
  // A pack grants checks AND keyword scans. Judging on checks alone let a
  // customer spend every scan and still take a full refund.
  assert.match(source, /const scansUntouched =/)
  assert.match(source, /!checksUntouched \|\| !scansUntouched/)
})

test('the refund is only created after every eligibility gate', () => {
  for (const gate of [
    "batch.refund_status !== 'active'",
    '!checksUntouched || !scansUntouched',
    'purchaseAgeMs > GUARANTEE_WINDOW_MS',
    "paymentIntent.status !== 'succeeded'",
  ]) {
    assert.ok(at(gate) < at('stripe.refunds.create'), `${gate} must precede the refund`)
  }
})

// ---------------------------------------------------------------------------
// State written after the money moves
// ---------------------------------------------------------------------------

test('the batch is zeroed for both credit types and marked refunded', () => {
  const update = between(".from('credit_batches')\n      .update(", '.eq(')
  assert.match(update, /checks_remaining: 0/)
  assert.match(update, /keyword_scans_remaining: 0/)
  assert.match(update, /refund_status: 'refunded'/)
})

test('the ledger records a leg per credit type', () => {
  const ledger = between('const ledgerRows = [', "await adminClient.from('check_ledger')")
  assert.match(ledger, /credit_type: 'check'/)
  assert.match(ledger, /credit_type: 'keyword_scan'/)
  assert.match(ledger, /amount: -scanClawback/)
})

test('the scan leg is omitted when there is nothing to claw back', () => {
  assert.match(source, /if \(scanClawback > 0\) \{/)
})

console.log(`\n${passed} tests passed`)
