// Run with: npx tsx supabase/functions/reconcile-ambiguous-refunds/index.test.ts
//
// Source level guards for the refund reconciler, in the same style as
// request-refund/index.test.ts: the handler is Deno only, so these read the
// source and pin the properties that make a refund mutating, JWT free
// endpoint safe to have deployed. No network, no Stripe, no database.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'index.ts'), 'utf8')
const config = readFileSync(join(here, '..', '..', 'config.toml'), 'utf8')

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

const at = (needle: string) => {
  const index = source.indexOf(needle)
  assert.ok(index >= 0, `source does not contain ${needle}`)
  return index
}

test('a missing CRON_INVOKE_SECRET rejects the request instead of skipping authentication', () => {
  assert.match(source, /const cronSecret = Deno\.env\.get\('CRON_INVOKE_SECRET'\)/)
  assert.match(source, /if \(!cronSecret\) \{[\s\S]*?status: 503/)
  // The fail open form this replaced (`if (cronSecret && ...)`) must never
  // come back. The source mentions it in a comment, so match the code shape.
  assert.doesNotMatch(source, /if \(cronSecret &&/)
})

test('the shared secret is checked before any Stripe or database client exists', () => {
  assert.ok(at("req.headers.get('x-cron-secret') !== cronSecret") < at('STRIPE_SECRET_KEY'))
  assert.ok(at("req.headers.get('x-cron-secret') !== cronSecret") < at('SUPABASE_SERVICE_ROLE_KEY'))
  assert.match(source, /!== cronSecret\) \{\s*\n\s*return new Response\('Unauthorized', \{ status: 401 \}\)/)
})

test('the handler never accepts a Supabase JWT as authentication', () => {
  for (const forbidden of ['Authorization', 'auth.getUser', 'SUPABASE_ANON_KEY']) {
    assert.ok(!source.includes(forbidden), `handler must not depend on ${forbidden}`)
  }
})

test('a refund is finalized only on a succeeded Stripe refund and failed only when every refund failed or was canceled', () => {
  assert.match(source, /refunds\.data\.find\(\(r\) => r\.status === 'succeeded'\)/)
  assert.ok(at("rpc('finalize_refund'") > at("r.status === 'succeeded'"))
  assert.match(source, /refunds\.data\.length > 0 &&\s*\n\s*refunds\.data\.every\(\(r\) =>\s*\n\s*r\.status === 'failed' \|\| r\.status === 'canceled'/)
  assert.ok(at("rpc('fail_refund'") > at("r.status === 'canceled'"))
})

test('anything Stripe cannot settle is left pending, never guessed', () => {
  assert.match(source, /stillAmbiguous \+= 1/)
  // Only the two definitive branches resolve; the fall through and the
  // catch both count as still ambiguous.
  assert.equal((source.match(/resolved \+= 1/g) ?? []).length, 2)
  assert.equal((source.match(/stillAmbiguous \+= 1/g) ?? []).length, 2)
})

test('the database work goes through the committed refund RPCs only', () => {
  for (const rpc of ['list_ambiguous_refund_candidates', 'finalize_refund', 'fail_refund']) {
    assert.ok(source.includes(`rpc(\n    '${rpc}'`) || source.includes(`rpc('${rpc}'`), `missing rpc ${rpc}`)
  }
  assert.ok(!source.includes(".from('refund_events')"), 'must not write refund_events directly')
})

test('config.toml turns the gateway JWT check off, since the caller is pg_cron with a shared secret', () => {
  assert.match(config, /\[functions\.reconcile-ambiguous-refunds\]\s*\nverify_jwt = false/)
})

console.log(`\n${passed} tests passed`)
