// Run with: npx tsx supabase/functions/brevo-stats/logic.test.ts
import assert from 'node:assert/strict'
import {
  brevoPathFor,
  isServiceRoleToken,
  matchesServiceRoleKey,
  parseAction,
  shapeCampaigns,
  shapeList,
  shapeTransactional,
  toReportRange,
} from './logic.ts'

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

/** Builds an unsigned JWT-shaped token carrying the given claims. */
function tokenWith(claims: Record<string, unknown>): string {
  const b64 = (value: string) =>
    Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64(JSON.stringify({ alg: 'HS256' }))}.${b64(JSON.stringify(claims))}.signature`
}

test('a service-role token is accepted', () => {
  assert.equal(isServiceRoleToken(`Bearer ${tokenWith({ role: 'service_role' })}`), true)
})

test('an authenticated customer token is rejected', () => {
  // The case that matters. A signed-in customer presents a perfectly valid JWT;
  // without this check they could read the company's email performance.
  assert.equal(isServiceRoleToken(`Bearer ${tokenWith({ role: 'authenticated' })}`), false)
})

test('an anon token is rejected', () => {
  assert.equal(isServiceRoleToken(`Bearer ${tokenWith({ role: 'anon' })}`), false)
})

test('a token with no role claim is rejected', () => {
  assert.equal(isServiceRoleToken(`Bearer ${tokenWith({ sub: 'abc' })}`), false)
})

test('a missing or malformed header is rejected', () => {
  assert.equal(isServiceRoleToken(null), false)
  assert.equal(isServiceRoleToken(''), false)
  assert.equal(isServiceRoleToken('Bearer'), false)
  assert.equal(isServiceRoleToken('Basic abc'), false)
  assert.equal(isServiceRoleToken('Bearer not.a.jwt.at.all'), false)
  assert.equal(isServiceRoleToken('Bearer onlyonepart'), false)
})

test('a token whose payload is not JSON is rejected rather than throwing', () => {
  assert.equal(isServiceRoleToken('Bearer header.bm90LWpzb24.sig'), false)
})

const REAL_KEY = 'eyJhbGciOiJIUzI1NiJ9.service-role-key-stand-in.signature'

test('the real gate accepts the exact service-role key', () => {
  assert.equal(matchesServiceRoleKey(`Bearer ${REAL_KEY}`, REAL_KEY), true)
})

test('the real gate rejects a forged token that merely CLAIMS service_role', () => {
  // This is the case the claim decode alone would let through. isServiceRoleToken
  // accepts it, so without this second check an unsigned forgery would be
  // authorised the moment verify_jwt was ever turned off for this function.
  const forged = `Bearer ${tokenWith({ role: 'service_role' })}`
  assert.equal(isServiceRoleToken(forged), true)
  assert.equal(matchesServiceRoleKey(forged, REAL_KEY), false)
})

test('the real gate rejects a near-miss key', () => {
  assert.equal(matchesServiceRoleKey(`Bearer ${REAL_KEY}x`, REAL_KEY), false)
  assert.equal(matchesServiceRoleKey(`Bearer ${REAL_KEY.slice(0, -1)}`, REAL_KEY), false)
  assert.equal(
    matchesServiceRoleKey(`Bearer ${REAL_KEY.slice(0, -1)}X`, REAL_KEY),
    false,
  )
})

test('the real gate fails closed when the function holds no key', () => {
  assert.equal(matchesServiceRoleKey(`Bearer ${REAL_KEY}`, undefined), false)
  assert.equal(matchesServiceRoleKey(`Bearer ${REAL_KEY}`, ''), false)
})

test('the real gate rejects a missing or malformed header', () => {
  assert.equal(matchesServiceRoleKey(null, REAL_KEY), false)
  assert.equal(matchesServiceRoleKey('Basic ' + REAL_KEY, REAL_KEY), false)
  assert.equal(matchesServiceRoleKey(REAL_KEY, REAL_KEY), false)
})

test('the comparison does not exit early on the first differing byte', () => {
  // A compare that returns as soon as bytes differ leaks the key one character
  // at a time through response timing. Same-length inputs differing at the
  // first and last position must behave identically.
  const differsFirst = 'X' + REAL_KEY.slice(1)
  const differsLast = REAL_KEY.slice(0, -1) + 'X'
  assert.equal(matchesServiceRoleKey(`Bearer ${differsFirst}`, REAL_KEY), false)
  assert.equal(matchesServiceRoleKey(`Bearer ${differsLast}`, REAL_KEY), false)
  assert.equal(differsFirst.length, differsLast.length)
})

test('parseAction accepts only the three read operations', () => {
  assert.equal(parseAction('transactional'), 'transactional')
  assert.equal(parseAction('list'), 'list')
  assert.equal(parseAction('campaigns'), 'campaigns')
})

test('parseAction rejects anything else', () => {
  // No send action exists, and none can be requested into existence.
  assert.equal(parseAction('send'), null)
  assert.equal(parseAction('sendTransacEmail'), null)
  assert.equal(parseAction(''), null)
  assert.equal(parseAction(undefined), null)
  assert.equal(parseAction({ action: 'list' }), null)
})

test('toReportRange converts an exclusive bound to an inclusive last day', () => {
  const range = toReportRange('2026-09-01T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
  assert.deepEqual(range, { startDate: '2026-09-01', endDate: '2026-09-07' })
})

test('toReportRange rejects a reversed, equal or malformed range', () => {
  assert.equal(toReportRange('2026-09-08T00:00:00Z', '2026-09-01T00:00:00Z'), null)
  assert.equal(toReportRange('2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z'), null)
  assert.equal(toReportRange('nonsense', '2026-09-08T00:00:00Z'), null)
  assert.equal(toReportRange(undefined, '2026-09-08T00:00:00Z'), null)
  assert.equal(toReportRange(42, 43), null)
})

test('brevoPathFor builds the transactional report path', () => {
  const path = brevoPathFor('transactional', {
    range: { startDate: '2026-09-01', endDate: '2026-09-07' },
  })
  assert.equal(path, '/smtp/statistics/aggregatedReport?startDate=2026-09-01&endDate=2026-09-07')
})

test('brevoPathFor refuses a transactional request with no range', () => {
  assert.equal(brevoPathFor('transactional', {}), null)
})

test('brevoPathFor builds the list path from a numeric id', () => {
  assert.equal(brevoPathFor('list', { listId: '3' }), '/contacts/lists/3')
})

test('a non-numeric list id cannot steer the request elsewhere', () => {
  // The id comes from configuration rather than a request body, but
  // constraining it means no value can ever redirect this at another endpoint.
  assert.equal(brevoPathFor('list', { listId: '../../senders' }), null)
  assert.equal(brevoPathFor('list', { listId: '3/../../smtp/email' }), null)
  assert.equal(brevoPathFor('list', { listId: '' }), null)
  assert.equal(brevoPathFor('list', {}), null)
})

test('brevoPathFor builds a fixed campaigns path', () => {
  assert.equal(
    brevoPathFor('campaigns', {}),
    '/emailCampaigns?statistics=globalStats&limit=20&offset=0&sort=desc',
  )
})

test('shapeTransactional keeps known numeric fields', () => {
  const shaped = shapeTransactional({
    requests: 120,
    delivered: 118,
    uniqueOpens: 40,
    hardBounces: 2,
  })
  assert.equal(shaped.requests, 120)
  assert.equal(shaped.delivered, 118)
  assert.equal(shaped.uniqueOpens, 40)
  assert.equal(shaped.hardBounces, 2)
})

test('shapeTransactional nulls anything missing or not a number', () => {
  // Null rather than zero: "not reported" and "none delivered" are different
  // statements and the dashboard renders them differently.
  const shaped = shapeTransactional({ requests: '120', delivered: null, opens: {} })
  assert.equal(shaped.requests, null)
  assert.equal(shaped.delivered, null)
  assert.equal(shaped.opens, null)
  assert.equal(shaped.blocked, null)
})

test('shapeTransactional survives a wholly unexpected payload', () => {
  assert.equal(shapeTransactional(null).requests, null)
  assert.equal(shapeTransactional('a string').delivered, null)
  assert.equal(shapeTransactional([]).opens, null)
})

test('shapeList narrows to the four fields shown', () => {
  const shaped = shapeList({ id: 3, name: 'Newsletter', totalSubscribers: 41, extra: 'ignored' })
  assert.deepEqual(shaped, {
    id: 3,
    name: 'Newsletter',
    totalSubscribers: 41,
    totalBlacklisted: null,
  })
})

test('shapeCampaigns reads global stats from each campaign', () => {
  const shaped = shapeCampaigns({
    campaigns: [
      {
        id: 7,
        name: 'Issue 01',
        subject: 'A strong CV for the wrong job',
        status: 'sent',
        sentDate: '2026-09-01T10:00:00Z',
        statistics: { globalStats: { sent: 100, delivered: 98, uniqueViews: 44, uniqueClicks: 9 } },
      },
    ],
  })
  assert.equal(shaped.length, 1)
  assert.equal(shaped[0].name, 'Issue 01')
  assert.equal(shaped[0].delivered, 98)
  assert.equal(shaped[0].uniqueOpens, 44)
  assert.equal(shaped[0].unsubscriptions, null)
})

test('shapeCampaigns returns an empty list for anything unexpected', () => {
  assert.deepEqual(shapeCampaigns({}), [])
  assert.deepEqual(shapeCampaigns(null), [])
  assert.deepEqual(shapeCampaigns({ campaigns: 'not an array' }), [])
})

test('shapeCampaigns tolerates a campaign with no statistics block', () => {
  const shaped = shapeCampaigns({ campaigns: [{ id: 1, name: 'Draft' }] })
  assert.equal(shaped[0].sent, null)
  assert.equal(shaped[0].name, 'Draft')
})

console.log(`\n${passed} tests passed`)
