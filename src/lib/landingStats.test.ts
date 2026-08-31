// Run with: npx tsx src/lib/landingStats.test.ts
import assert from 'node:assert/strict'
import { toLandingStats, type LandingStatsRow } from './landingStats'

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

const belowFloor: LandingStatsRow = {
  meets_floor: false,
  checks_completed: null,
  accounts: null,
  roles_covered: null,
  avg_rerun_score_delta: null,
  rerun_pairs: null,
  median_minutes_to_verdict: null,
}

const aboveFloor: LandingStatsRow = {
  meets_floor: true,
  checks_completed: 412,
  accounts: 137,
  roles_covered: 96,
  avg_rerun_score_delta: 9,
  rerun_pairs: 41,
  median_minutes_to_verdict: 3,
}

// ---------------------------------------------------------------------------
// The floor. The server decides it; this only reads the verdict. Anything
// that reaches the page below the floor is a figure the public endpoint
// should never have sent.
// ---------------------------------------------------------------------------

test('FLOOR: a row below the floor carries no figures at all', () => {
  assert.deepEqual(toLandingStats(belowFloor), { meetsFloor: false })
})

test('FLOOR: a row above the floor maps every figure through', () => {
  assert.deepEqual(toLandingStats(aboveFloor), {
    meetsFloor: true,
    checksCompleted: 412,
    accounts: 137,
    rolesCovered: 96,
    avgRerunScoreDelta: 9,
    rerunPairs: 41,
    medianMinutesToVerdict: 3,
  })
})

test('FLOOR: a missing row is below the floor, not an empty product', () => {
  assert.deepEqual(toLandingStats(null), { meetsFloor: false })
  assert.deepEqual(toLandingStats(undefined), { meetsFloor: false })
})

// ---------------------------------------------------------------------------
// Malformed rows. The page shows its product figures rather than a zero,
// which is the same thing it does when the fetch fails outright.
// ---------------------------------------------------------------------------

test('MALFORMED: meets_floor true without the counts to back it is refused', () => {
  assert.deepEqual(toLandingStats({ ...aboveFloor, checks_completed: null }), { meetsFloor: false })
  assert.deepEqual(toLandingStats({ ...aboveFloor, accounts: null }), { meetsFloor: false })
  assert.deepEqual(toLandingStats({ ...aboveFloor, roles_covered: null }), { meetsFloor: false })
  assert.deepEqual(toLandingStats({ ...aboveFloor, rerun_pairs: null }), { meetsFloor: false })
})

test('MALFORMED: a null meets_floor is not treated as clearing it', () => {
  assert.deepEqual(toLandingStats({ ...aboveFloor, meets_floor: null }), { meetsFloor: false })
})

// ---------------------------------------------------------------------------
// The two derived figures are legitimately null above the floor: nobody has
// rerun a check yet, or no check has a usable duration. Neither is a reason
// to withhold the counts.
// ---------------------------------------------------------------------------

test('DERIVED: a null delta or median survives above the floor', () => {
  const stats = toLandingStats({
    ...aboveFloor,
    avg_rerun_score_delta: null,
    median_minutes_to_verdict: null,
  })
  assert.equal(stats.meetsFloor, true)
  if (!stats.meetsFloor) throw new Error('unreachable')
  assert.equal(stats.avgRerunScoreDelta, null)
  assert.equal(stats.medianMinutesToVerdict, null)
  assert.equal(stats.checksCompleted, 412)
})

console.log(`\n${passed} tests passed`)
