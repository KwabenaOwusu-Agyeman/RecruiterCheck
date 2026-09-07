// Run with: npx tsx admin/src/lib/redirectTarget.test.ts
import assert from 'node:assert/strict'
import { DEFAULT_REDIRECT, safeRedirectTarget } from './redirectTarget'

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

test('an ordinary same-origin path is kept', () => {
  assert.equal(safeRedirectTarget('/'), '/')
  assert.equal(safeRedirectTarget('/users'), '/users')
  assert.equal(safeRedirectTarget('/checks/abc-123'), '/checks/abc-123')
  assert.equal(safeRedirectTarget('/users?q=jane&page=2'), '/users?q=jane&page=2')
  assert.equal(safeRedirectTarget('/audience#newsletter'), '/audience#newsletter')
})

test('absent, empty or non-string targets fall back', () => {
  assert.equal(safeRedirectTarget(null), DEFAULT_REDIRECT)
  assert.equal(safeRedirectTarget(undefined), DEFAULT_REDIRECT)
  assert.equal(safeRedirectTarget(''), DEFAULT_REDIRECT)
  assert.equal(safeRedirectTarget(42 as unknown as string), DEFAULT_REDIRECT)
})

test('an absolute URL is refused', () => {
  // The plain case: bounce the freshly signed-in admin to an attacker's page.
  assert.equal(safeRedirectTarget('https://evil.test/'), DEFAULT_REDIRECT)
  assert.equal(safeRedirectTarget('http://evil.test/'), DEFAULT_REDIRECT)
  assert.equal(safeRedirectTarget('//evil.test'), DEFAULT_REDIRECT)
  assert.equal(safeRedirectTarget('///evil.test'), DEFAULT_REDIRECT)
})

test('a javascript or data target is refused', () => {
  assert.equal(safeRedirectTarget('javascript:alert(1)'), DEFAULT_REDIRECT)
  assert.equal(safeRedirectTarget('data:text/html,<script>'), DEFAULT_REDIRECT)
})

test('a backslash cannot smuggle in a protocol-relative URL', () => {
  // A browser reads a backslash as a forward slash in the authority position,
  // so "/\evil.test" navigates off-origin even though it starts with a slash.
  assert.equal(safeRedirectTarget('/\\evil.test'), DEFAULT_REDIRECT)
  assert.equal(safeRedirectTarget('\\\\evil.test'), DEFAULT_REDIRECT)
  assert.equal(safeRedirectTarget('/users\\@evil.test'), DEFAULT_REDIRECT)
})

test('percent-encoding cannot hide any of the above', () => {
  // Each of these passes a naive "starts with / and not //" check and is then
  // decoded during navigation. Decoding once and re-applying the rule is why
  // they are caught.
  assert.equal(safeRedirectTarget('/%2F%2Fevil.test'), DEFAULT_REDIRECT)
  assert.equal(safeRedirectTarget('/%5Cevil.test'), DEFAULT_REDIRECT)
  assert.equal(safeRedirectTarget('/%5C%5Cevil.test'), DEFAULT_REDIRECT)
})

test('a malformed escape sequence is refused rather than guessed at', () => {
  assert.equal(safeRedirectTarget('/%'), DEFAULT_REDIRECT)
  assert.equal(safeRedirectTarget('/%zz'), DEFAULT_REDIRECT)
  assert.equal(safeRedirectTarget('/%E0%A4%A'), DEFAULT_REDIRECT)
})

test('control characters and whitespace are refused', () => {
  // Browsers strip these while parsing, so the string a reviewer reads is not
  // the URL the browser resolves.
  assert.equal(safeRedirectTarget('/\thttps://evil.test'), DEFAULT_REDIRECT)
  assert.equal(safeRedirectTarget('/\nhttps://evil.test'), DEFAULT_REDIRECT)
  assert.equal(safeRedirectTarget('/\rhttps://evil.test'), DEFAULT_REDIRECT)
  assert.equal(safeRedirectTarget('/ https://evil.test'), DEFAULT_REDIRECT)
  assert.equal(safeRedirectTarget(' /users'), DEFAULT_REDIRECT)
  assert.equal(safeRedirectTarget('/\u0000/evil.test'), DEFAULT_REDIRECT)
})

test('a legitimately encoded query value still survives', () => {
  // The rule must not be so blunt that ordinary links stop working: decoding
  // this yields "/users?q=a b", which is still a same-origin absolute path.
  assert.equal(safeRedirectTarget('/users?q=a%20b'), '/users?q=a%20b')
  assert.equal(safeRedirectTarget('/users?q=%40acme'), '/users?q=%40acme')
})

test('a relative path with no leading slash is refused', () => {
  // "users" resolves against the current directory, which is not a promise
  // about where it lands.
  assert.equal(safeRedirectTarget('users'), DEFAULT_REDIRECT)
  assert.equal(safeRedirectTarget('../admin'), DEFAULT_REDIRECT)
})

test('the returned value is always safe to hand to redirect()', () => {
  // The property the callers depend on: whatever comes back starts with a
  // single slash and cannot leave this origin.
  const probes = [
    '/', '/users', 'https://evil.test', '//evil.test', '/\\evil.test',
    '/%2F%2Fevil.test', 'javascript:alert(1)', '', null, undefined,
  ]
  for (const probe of probes) {
    const result = safeRedirectTarget(probe as string)
    assert.ok(result.startsWith('/'), `${String(probe)} produced ${result}`)
    assert.ok(!result.startsWith('//'), `${String(probe)} produced ${result}`)
    assert.ok(!result.includes('\\'), `${String(probe)} produced ${result}`)
  }
})

console.log(`\n${passed} tests passed`)
