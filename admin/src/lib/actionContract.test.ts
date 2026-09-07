// Run with: npx tsx admin/src/lib/actionContract.test.ts
//
// Guards two properties of the login Server Actions that are invisible from
// reading them casually, and that a well-meaning simplification would undo.
//
// These are source-level assertions rather than behavioural ones because the
// actions depend on next/headers and the Supabase server client, neither of
// which exists outside a request. A source guard still does the job it is here
// for: it fails the suite the moment someone changes the shape back.
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

const actions = readFileSync('admin/src/app/actions.ts', 'utf8')

/** The body of a named exported async function, up to the next export. */
function bodyOf(name: string): string {
  const start = actions.indexOf(`export async function ${name}`)
  assert.notEqual(start, -1, `${name} not found in actions.ts`)
  const rest = actions.slice(start + 1)
  const end = rest.indexOf('\nexport ')
  return end === -1 ? rest : rest.slice(0, end)
}

test('signInWithGoogleAction returns a URL and never redirects to it', () => {
  // THE REASON, because it is not guessable from the code:
  //
  // A Server Action is a form POST. middleware.ts sets `form-action 'self'` in
  // the Content-Security-Policy, and that directive constrains not just where a
  // form submits but the redirects the submission then follows. Chrome enforces
  // it. So calling redirect() here with an accounts.google.com URL can be
  // blocked outright, and the failure looks like Google sign-in silently doing
  // nothing.
  //
  // Returning the URL and letting the client assign window.location.href is a
  // plain navigation, which form-action does not cover. This holds regardless
  // of whether a given browser would have permitted the redirect, which is why
  // it is the shape even though the redirect might work somewhere.
  const body = bodyOf('signInWithGoogleAction')

  assert.ok(
    !/\bredirect\s*\(/.test(body),
    'signInWithGoogleAction must not call redirect(): form-action CSP can block a ' +
      'server-side redirect to the provider. Return the URL and navigate client side.',
  )
  assert.match(
    body,
    /return\s*\{\s*url:\s*data\.url/,
    'signInWithGoogleAction must return the provider URL to the caller',
  )
  assert.match(
    body,
    /skipBrowserRedirect:\s*true/,
    'skipBrowserRedirect keeps supabase-js from attempting its own navigation',
  )
})

test('the client navigates with window.location.href, not a form submission', () => {
  // The other half of the same contract: returning the URL only helps if the
  // caller navigates rather than posting to it.
  const form = readFileSync('admin/src/app/login/LoginForm.tsx', 'utf8')
  assert.match(form, /window\.location\.href\s*=/)
})

test('sendMagicLinkAction cannot create accounts', () => {
  // Without shouldCreateUser: false, typing any address into a form that is
  // reachable without signing in creates an account for it.
  const body = bodyOf('sendMagicLinkAction')
  assert.match(body, /shouldCreateUser:\s*false/)
})

test('sendMagicLinkAction answers identically whatever happens', () => {
  // The address existing, not existing, or existing but not being an admin must
  // be indistinguishable from outside, or the form becomes a way to test who
  // has an account. One constant, returned on the success path and after a
  // swallowed throw, is what makes that true.
  const body = bodyOf('sendMagicLinkAction')

  assert.match(body, /MAGIC_LINK_RESPONSE/, 'the fixed response must be used')

  // Exactly one place builds the non-empty-field response.
  const responses = body.match(/message:\s*MAGIC_LINK_RESPONSE/g) ?? []
  assert.equal(
    responses.length,
    1,
    'more than one success response means the branches can drift apart',
  )

  // A catch that returned its own message would leak the difference. The
  // catch block is isolated first: a looser regex spanning from `catch` to the
  // next `return {` reaches past the block into the function's own final
  // return, which legitimately contains an `error:` key.
  const catchStart = body.indexOf('catch (')
  assert.notEqual(catchStart, -1, 'the Supabase call must be wrapped')
  const catchBody = body.slice(catchStart, body.indexOf('\n  }', catchStart))
  assert.ok(
    !/\breturn\b/.test(catchBody),
    'the catch block must not return: swallowing the error is what keeps the ' +
      'response identical for every address',
  )
})

test('no rate-limit bucket is keyed on the submitted address', () => {
  // An unauthenticated counter keyed on an attacker-supplied value is itself a
  // denial-of-service tool: anyone could exhaust the owner's allowance by
  // submitting the owner's address. Supabase applies its own per-address send
  // limits.
  const body = bodyOf('sendMagicLinkAction')
  assert.ok(
    !/check_and_record_rate_limit/.test(body),
    'sendMagicLinkAction must not add an email-keyed rate limit bucket',
  )
})

test('the password sign-in path is still present', () => {
  // This change adds ways in; it removes none. The password form is the
  // fallback when a provider is unavailable.
  assert.match(actions, /export async function signInAction/)
  assert.match(actions, /signInWithPassword/)
})

console.log(`\n${passed} tests passed`)
