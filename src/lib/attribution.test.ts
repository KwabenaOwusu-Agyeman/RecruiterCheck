// Run with: npx tsx src/lib/attribution.test.ts
import assert from 'node:assert/strict'
import {
  buildAttribution,
  captureFirstTouch,
  hasAnySignal,
  parseReferrerHost,
  parseStoredAttribution,
  parseUtm,
  readFirstTouch,
  sanitizeParam,
  sanitizePath,
} from './attribution'

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

test('sanitizeParam trims and passes ordinary values through', () => {
  assert.equal(sanitizeParam('  google  '), 'google')
  assert.equal(sanitizeParam('cpc'), 'cpc')
})

test('sanitizeParam rejects empty, whitespace-only and non-strings', () => {
  assert.equal(sanitizeParam(''), null)
  assert.equal(sanitizeParam('   '), null)
  assert.equal(sanitizeParam(null), null)
  assert.equal(sanitizeParam(undefined), null)
  assert.equal(sanitizeParam(42 as unknown as string), null)
})

test('sanitizeParam strips control characters', () => {
  // A newline in a UTM value would break a CSV row and could forge a log line.
  assert.equal(sanitizeParam('goo\u0007gle'), 'google')
  assert.equal(sanitizeParam('line\nbreak'), 'linebreak')
  assert.equal(sanitizeParam('tab\there'), 'tabhere')
})

test('sanitizeParam caps length', () => {
  // These land in a table anon can INSERT into, so length is bounded in code
  // as well as by a database CHECK.
  assert.equal(sanitizeParam('x'.repeat(500))?.length, 100)
  assert.equal(sanitizePath('/' + 'y'.repeat(500))?.length, 200)
})

test('parseUtm reads the three tracked parameters', () => {
  const utm = parseUtm('?utm_source=google&utm_medium=cpc&utm_campaign=spring')
  assert.deepEqual(utm, { source: 'google', medium: 'cpc', campaign: 'spring' })
})

test('parseUtm works without a leading question mark', () => {
  assert.equal(parseUtm('utm_source=newsletter').source, 'newsletter')
})

test('parseUtm returns nulls when parameters are absent', () => {
  assert.deepEqual(parseUtm(''), { source: null, medium: null, campaign: null })
  assert.deepEqual(parseUtm('?other=1'), { source: null, medium: null, campaign: null })
})

test('parseUtm ignores utm_term and utm_content', () => {
  // Deliberately not stored: three dimensions answer the questions being asked
  // and every extra column is another field of untrusted free text.
  const utm = parseUtm('?utm_term=cv+checker&utm_content=variant-b')
  assert.deepEqual(utm, { source: null, medium: null, campaign: null })
})

test('parseUtm decodes percent-encoded values', () => {
  assert.equal(parseUtm('?utm_campaign=spring%20launch').campaign, 'spring launch')
})

test('parseReferrerHost returns the host of an external referrer', () => {
  assert.equal(
    parseReferrerHost('https://www.google.com/search?q=secret+query', 'myrecruitercheck.com'),
    'www.google.com',
  )
})

test('parseReferrerHost keeps only the host, never the query string', () => {
  // A referring URL's query string routinely carries personal data. This is
  // the whole reason the full URL is not stored.
  const host = parseReferrerHost(
    'https://mail.example.com/inbox?email=jane%40example.com&token=abc',
    'myrecruitercheck.com',
  )
  assert.equal(host, 'mail.example.com')
  assert.ok(!host?.includes('jane'))
  assert.ok(!host?.includes('token'))
})

test('parseReferrerHost drops a same-origin referrer', () => {
  // An internal navigation is not an acquisition; counting it would credit the
  // site with sending traffic to itself.
  assert.equal(
    parseReferrerHost('https://myrecruitercheck.com/pricing', 'myrecruitercheck.com'),
    null,
  )
})

test('parseReferrerHost compares hosts case insensitively', () => {
  assert.equal(
    parseReferrerHost('https://MyRecruiterCheck.com/x', 'myrecruitercheck.com'),
    null,
  )
})

test('parseReferrerHost treats a subdomain as external', () => {
  // www and the apex are different hosts; only an exact match is internal.
  assert.equal(
    parseReferrerHost('https://blog.myrecruitercheck.com/post', 'myrecruitercheck.com'),
    'blog.myrecruitercheck.com',
  )
})

test('parseReferrerHost returns null for direct traffic and junk', () => {
  assert.equal(parseReferrerHost('', 'myrecruitercheck.com'), null)
  assert.equal(parseReferrerHost('not a url', 'myrecruitercheck.com'), null)
  assert.equal(parseReferrerHost('javascript:alert(1)', 'myrecruitercheck.com'), null)
})

test('buildAttribution assembles a full record', () => {
  const attribution = buildAttribution({
    search: '?utm_source=google&utm_medium=organic',
    referrer: 'https://www.google.com/',
    currentHost: 'myrecruitercheck.com',
    pathname: '/ats-resume-checker',
    now: new Date('2026-09-05T12:00:00Z'),
  })
  assert.deepEqual(attribution, {
    source: 'google',
    medium: 'organic',
    campaign: null,
    landingPath: '/ats-resume-checker',
    referrerHost: 'www.google.com',
    capturedAt: '2026-09-05T12:00:00.000Z',
  })
})

test('buildAttribution records direct traffic with just the landing path', () => {
  const attribution = buildAttribution({
    search: '',
    referrer: '',
    currentHost: 'myrecruitercheck.com',
    pathname: '/',
    now: new Date('2026-09-05T12:00:00Z'),
  })
  assert.equal(attribution.source, null)
  assert.equal(attribution.referrerHost, null)
  assert.equal(attribution.landingPath, '/')
  // Still worth storing: which page someone landed on is the SEO question.
  assert.equal(hasAnySignal(attribution), true)
})

test('hasAnySignal rejects a wholly empty record', () => {
  assert.equal(
    hasAnySignal({
      source: null,
      medium: null,
      campaign: null,
      landingPath: null,
      referrerHost: null,
      capturedAt: '2026-09-05T12:00:00.000Z',
    }),
    false,
  )
})

test('parseStoredAttribution round-trips what buildAttribution produced', () => {
  const attribution = buildAttribution({
    search: '?utm_source=newsletter',
    referrer: 'https://mail.example.com/',
    currentHost: 'myrecruitercheck.com',
    pathname: '/pricing',
    now: new Date('2026-09-05T12:00:00Z'),
  })
  assert.deepEqual(parseStoredAttribution(JSON.stringify(attribution)), attribution)
})

test('parseStoredAttribution rejects malformed storage', () => {
  // localStorage is user-writable, so this is untrusted input on the way back.
  assert.equal(parseStoredAttribution(null), null)
  assert.equal(parseStoredAttribution(''), null)
  assert.equal(parseStoredAttribution('not json'), null)
  assert.equal(parseStoredAttribution('"a string"'), null)
  assert.equal(parseStoredAttribution('12345'), null)
  assert.equal(parseStoredAttribution('null'), null)
})

test('parseStoredAttribution rejects a record with no usable timestamp', () => {
  assert.equal(parseStoredAttribution('{"source":"google"}'), null)
  assert.equal(parseStoredAttribution('{"source":"g","capturedAt":"nonsense"}'), null)
  assert.equal(parseStoredAttribution('{"source":"g","capturedAt":123}'), null)
})

test('parseStoredAttribution sanitises tampered values rather than trusting them', () => {
  const tampered = JSON.stringify({
    source: 'x'.repeat(5000),
    medium: 'cpc\u0000injected',
    campaign: { nested: 'object' },
    landingPath: '/ok',
    referrerHost: 'evil.test',
    capturedAt: '2026-09-05T12:00:00.000Z',
  })
  const parsed = parseStoredAttribution(tampered)
  assert.ok(parsed)
  assert.equal(parsed.source?.length, 100)
  assert.equal(parsed.medium, 'cpcinjected')
  // A non-string field is dropped rather than coerced.
  assert.equal(parsed.campaign, null)
  assert.equal(parsed.landingPath, '/ok')
})

test('the browser helpers are safe to call where there is no window', () => {
  // These run during the SSR prerender (scripts/prerender.mjs), where touching
  // window or document would throw and break the build.
  assert.equal(typeof globalThis.window, 'undefined')
  assert.equal(readFirstTouch(), null)
  assert.equal(captureFirstTouch(), null)
})

console.log(`\n${passed} tests passed`)
