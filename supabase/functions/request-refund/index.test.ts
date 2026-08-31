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

function between(startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle)
  assert.ok(start !== -1, `anchor not found: ${startNeedle}`)
  const end = source.indexOf(endNeedle, start + startNeedle.length)
  assert.ok(end !== -1, `end anchor not found after start: ${endNeedle}`)
  return source.slice(start, end)
}

// ---------------------------------------------------------------------------
// Eligibility and reservation are the RPC's job, not this function's
// ---------------------------------------------------------------------------

test('eligibility is decided by reserve_refund, not re-implemented here', () => {
  // Checking eligibility out here cannot be atomic: two concurrent requests
  // could both read an eligible batch and both refund it. reserve_refund does
  // it under the global profile-then-batch lock order and reserves in the same
  // transaction.
  assert.match(source, /rpc\('reserve_refund', \{\s*\n?\s*p_batch_id: batch\.id/)
  assert.ok(!source.includes('GUARANTEE_WINDOW_MS >'), 'window check belongs to the RPC')
  assert.ok(!source.includes('checksUntouched'), 'used-pack check belongs to the RPC')
})

test('reserve_refund is called with the caller identity, not the service role', () => {
  // It is granted to `authenticated` and reads auth.uid(); the service role
  // would have no uid and the call would fail closed.
  assert.match(source, /userClient\.rpc\('reserve_refund'/)
  assert.ok(!/adminClient\.rpc\('reserve_refund'/.test(source))
})

test('every reservation outcome maps to a response', () => {
  const sw = between("switch (reserved?.outcome)", 'const refundEventId')
  for (const outcome of [
    'reserved',
    'batch_not_found',
    'already_refunded',
    'already_refund_pending',
    'already_used',
    'window_expired',
    'active_reservation_exists',
  ]) {
    assert.ok(sw.includes(`case '${outcome}'`), `unhandled reservation outcome: ${outcome}`)
  }
  assert.match(sw, /default:/)
})

// ---------------------------------------------------------------------------
// Once reserved, every exit must resolve the reservation
// ---------------------------------------------------------------------------

test('a failure before the money moves releases the reservation', () => {
  // Leaving the batch in refund_pending would make the pack permanently
  // un-refundable.
  assert.match(source, /rpc\('fail_refund', \{ p_refund_event_id: refundEventId \}\)/)
  const guarded = between('const releaseReservation', 'finalize_refund')
  const releases = guarded.match(/await releaseReservation\(\)/g) ?? []
  assert.ok(releases.length >= 3, `expected every pre-refund exit to release, found ${releases.length}`)
})

test('a Stripe failure releases rather than leaving the batch pending', () => {
  const catchBlock = between('catch (stripeError)', '}')
  assert.match(catchBlock, /await releaseReservation\(\)/)
})

test('the claw-back is finalize_refund, not hand-written writes', () => {
  assert.match(source, /rpc\('finalize_refund', \{/)
  assert.match(source, /p_stripe_refund_id: stripeRefundId/)
  for (const forbidden of ["from('credit_batches')\n      .update", "from('check_ledger')"]) {
    assert.ok(!source.includes(forbidden), `must not write ${forbidden} by hand`)
  }
  assert.ok(!source.includes('keyword_scans_remaining: 0'), 'claw-back arithmetic belongs to the RPC')
})

test('a finalize failure after the refund does NOT release the reservation', () => {
  // The money has already left. Marking the batch active again would show the
  // customer a live pack they have been refunded for.
  const block = between('if (finalizeError)', 'return jsonResponse')
  assert.ok(!block.includes('releaseReservation'), 'must not restore a batch whose refund succeeded')
  assert.match(block, /refund issued but finalize_refund failed/)
})

test('an already-refunded payment intent finalises rather than double-refunding', () => {
  const block = between('existingRefunds.data.length > 0', 'const refund =')
  assert.match(block, /stripeRefundId = existingRefunds\.data\[0\]\.id/)
})

console.log(`\n${passed} tests passed`)
