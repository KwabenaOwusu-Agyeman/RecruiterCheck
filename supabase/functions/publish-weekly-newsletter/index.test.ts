// Run with: npx tsx supabase/functions/publish-weekly-newsletter/index.test.ts
//
// Guards the ORDER of three operations in index.ts. Order is the whole
// correctness argument here and it is invisible from reading any one line, so a
// reasonable looking edit can reintroduce a double send without failing
// anything else.
//
// These are source-level assertions rather than behavioural ones because
// index.ts imports Deno.serve and the Supabase client, neither of which exists
// under tsx. The same approach and the same reason as
// admin/src/lib/actionContract.test.ts and stripe-webhook/index.test.ts.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

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

const source = readFileSync('supabase/functions/publish-weekly-newsletter/index.ts', 'utf8')

/** Strips line comments, so a guard asserts on code rather than on prose. */
function withoutComments(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n')
}

const code = withoutComments(source)

/** Index of the first match, asserted to exist so a rename fails loudly. */
function at(pattern: RegExp, label: string): number {
  const match = pattern.exec(code)
  assert.ok(match, `${label} not found in index.ts. If it was renamed, update this test rather than deleting it.`)
  return match.index
}

test('the week is reserved BEFORE the campaign is created', () => {
  // THE REASON, because it is not guessable from the code:
  //
  // Create-then-record loses the record if the write fails, and the next
  // invocation then builds and sends a SECOND campaign to the whole list. The
  // first run poller fires every ten minutes, so that is a loop rather than a
  // remote possibility. Reserving first means a lost write leaves a row that
  // blocks the retry. Email cannot be recalled; a duplicate cannot be undone.
  const reserve = at(/\.insert\(\{\s*\n?\s*year, week, status: 'scheduled'/, 'the reservation insert')
  const campaign = at(/fetchWithTimeout\(\s*\n?\s*BREVO_CAMPAIGN_ENDPOINT/, 'the Brevo campaign call')

  assert.ok(
    reserve < campaign,
    'the reservation must come before the Brevo call, or a failed write becomes a second campaign',
  )
})

test('the idempotence check runs before anything that can fail', () => {
  // fail() writes status 'failed' for this year and week. Running it while a
  // campaign was already scheduled would overwrite the live row and lose its
  // campaign_id, leaving a record saying the week failed while the email went
  // out anyway. Checking first means fail() only ever touches a row this run
  // created.
  const idempotence = at(/\.eq\('status', 'scheduled'\)/, 'the existing-issue check')
  const firstFail = at(/return await fail\(/, 'the first fail() call')

  assert.ok(
    idempotence < firstFail,
    'the existing-issue check must precede every fail() path, or a failure can clobber a live campaign',
  )
})

test('the post-campaign write updates, and never replaces the row', () => {
  // An upsert here would rewrite the reservation wholesale. The reservation is
  // what makes the week safe, so the only thing this write should add is the
  // id Brevo just returned.
  const tail = code.slice(at(/fetchWithTimeout\(\s*\n?\s*BREVO_CAMPAIGN_ENDPOINT/, 'the Brevo campaign call'))
  assert.ok(
    /\.update\(\{ campaign_id/.test(tail),
    'the campaign id must be written with update()',
  )
  assert.ok(
    !/\.upsert\(/.test(tail),
    'nothing after the Brevo call may upsert: that would rewrite the reservation',
  )
})

test('a Brevo error is reported by status, never by body', () => {
  // A Brevo error body can echo the request back, and the request body is the
  // entire issue including every subscriber-facing word. Status only.
  assert.ok(
    /Brevo campaign creation returned \$\{campaignResponse\.status\}/.test(code),
    'the Brevo failure path must report the status code alone',
  )
  assert.ok(
    !/campaignResponse\.text\(\)/.test(code),
    'the Brevo error body must not be read into a message or a log',
  )
})

test('the service role claim is decoded, not byte compared', () => {
  // Comparing the bearer against SUPABASE_SERVICE_ROLE_KEY looks stricter and
  // is wrong: the Vault key is a valid token for this project but does not
  // byte-match the runtime's injected env var. That has already broken a
  // function in this repo once.
  assert.ok(/role === 'service_role'/.test(code), 'the role claim must be checked')
  assert.ok(
    !/=== *Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/.test(code),
    'never byte-compare the bearer against the injected service role key',
  )
})

console.log(`\n${passed} tests passed`)
