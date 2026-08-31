// Run with: npx tsx supabase/functions/send-welcome-email/index.test.ts
//
// index.ts drives the Supabase client end-to-end (auth, claim, send,
// revert on failure), which needs a live Postgres/GoTrue connection to
// exercise for real — not available via `npx tsx` outside the
// Deno/Supabase runtime. This is a source-level regression guard instead:
// it fails loudly if a future edit removes any of the security properties
// this design depends on (authenticated-only, no client-supplied identity,
// atomic claim, revert-on-failure, rollout gate, generic responses).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

let passed = 0
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passed += 1
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`FAIL - ${name}`)
    throw error
  }
}

const source = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf-8')

async function run() {
  await test('rejects any request without an Authorization bearer token', () => {
    assert.match(source, /req\.headers\.get\('Authorization'\)/)
    // Matches the security property (a 401 'Unauthorized' Response) without
    // pinning the rest of the ResponseInit, so adding e.g. CORS headers to the
    // error path does not read as a security regression.
    assert.match(source, /return new Response\('Unauthorized', \{\s*status: 401\b/)
  })

  await test('derives the user from a live auth.getUser(token) call, not a client-side claims decode', () => {
    assert.match(source, /anonClient\.auth\.getUser\(token\)/)
  })

  await test('never reads a recipient email or user id from the request body', () => {
    assert.ok(!source.includes('await req.json()'))
    assert.ok(!/req\.body/.test(source))
  })

  await test('requires email_confirmed_at via isEmailConfirmed before proceeding', () => {
    assert.match(source, /isEmailConfirmed\(user\)/)
  })

  await test('enforces the rollout gate via isRolloutEligible before claiming', () => {
    const claimIndex = source.indexOf(".from('profiles')\n    .update({ welcome_email_sent_at: claimTimestamp")
    const rolloutIndex = source.indexOf('isRolloutEligible(')
    assert.ok(rolloutIndex > -1 && claimIndex > -1 && rolloutIndex < claimIndex)
  })

  await test('claims welcome_email_sent_at only when currently null (atomic, race-safe)', () => {
    assert.match(source, /\.is\('welcome_email_sent_at', null\)/)
  })

  await test('reverts the claim back to null when the Brevo send fails', () => {
    const sendFailureBlock = source.slice(source.indexOf('if (!result.sent)'))
    assert.match(sendFailureBlock, /welcome_email_sent_at:\s*null/)
    assert.match(sendFailureBlock, /\.eq\('welcome_email_sent_at', claimTimestamp\)/)
  })

  await test('every branch after auth returns the same generic response, not a distinguishing one', () => {
    const afterAuth = source.slice(source.indexOf('const user: AuthenticatedUser'))
    // Every early return after the auth check must be the shared GENERIC_OK
    // constant, not a bespoke Response — this is what keeps "already sent",
    // "not verified", "not eligible", and "send failed" indistinguishable.
    const bareResponses = afterAuth.match(/return new Response\(/g) ?? []
    assert.equal(bareResponses.length, 0)
  })

  console.log(`\n${passed} passed`)
}

void run()
