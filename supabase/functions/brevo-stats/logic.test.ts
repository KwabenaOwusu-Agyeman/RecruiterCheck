// Run with: npx tsx supabase/functions/brevo-stats/logic.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  brevoPathFor,
  isServiceRoleToken,
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

// The deploy workflow is guarded here rather than in its own file because the
// test runner only discovers tests under src, admin/src and supabase/functions,
// and because this function is the one whose silent staleness prompted the fix.
// The verify_jwt map guard in stripe-webhook/index.test.ts sets the precedent
// for a cross-cutting config assertion living in a function's test file.
const workflow = readFileSync('.github/workflows/deploy-edge-functions.yml', 'utf8')

test('the deploy workflow diffs against the last successful run', () => {
  // Diffing against the previous commit loses work whenever a run fails: if the
  // commit that fixes a failed run touches different directories, the functions
  // from the failed run are never selected again, main carries new code, and
  // production quietly runs the old. That happened to brevo-stats on
  // 2026-09-06 and only its version number revealed it.
  assert.ok(
    workflow.includes('actions/workflows/${WORKFLOW_FILE}/runs?branch=main&status=success'),
    'the workflow must resolve its diff base from the last successful run',
  )
  // Comment lines are stripped first: the header explains WHY
  // github.event.before is not the base, and mentioning it there is the point.
  // What must not come back is an actual reference that feeds the diff.
  const executable = workflow
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n')
  assert.ok(
    !executable.includes('github.event.before'),
    'github.event.before is the base that caused the silent-staleness bug',
  )
})

test('every base-resolution failure widens to deploying everything', () => {
  // Narrowing on failure is what fails silently. Redeploying an unchanged
  // function is a slow no-op; skipping one that needed to go out is invisible.
  const widenings = workflow.match(/deploying every function/g) ?? []
  assert.ok(
    widenings.length >= 4,
    `expected every fallback to deploy everything, found ${widenings.length}`,
  )
})

test('the workflow can list its own runs', () => {
  // Resolving the base calls the Actions API, which needs this permission.
  // Without it the lookup returns nothing and every run deploys everything:
  // correct, but slow, and it would hide that the base is never resolving.
  assert.match(workflow, /permissions:[\s\S]*actions: read/)
})

console.log(`\n${passed} tests passed`)
