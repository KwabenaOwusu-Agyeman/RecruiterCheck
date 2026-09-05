// Run with: npx tsx admin/src/lib/time.test.ts
import assert from 'node:assert/strict'
import {
  addDays,
  addMonths,
  bucketStarts,
  resolvePeriod,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  isValidTimeZone,
  zonedTimeToUtc,
} from './time'

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

const LDN = 'Europe/London'
const iso = (d: Date) => d.toISOString()

test('startOfDay in winter puts local midnight at 00:00 UTC', () => {
  // London is on GMT in January, so local midnight is the UTC midnight.
  assert.equal(iso(startOfDay(new Date('2026-01-15T14:32:00Z'), LDN)), '2026-01-15T00:00:00.000Z')
})

test('startOfDay in summer puts local midnight at 23:00 UTC the day before', () => {
  // British Summer Time is UTC+1, so 00:00 local on 15 June is 23:00Z on 14 June.
  // A UTC-only implementation returns 2026-06-15T00:00:00Z here and silently
  // attributes an hour of the previous local day to the wrong day.
  assert.equal(iso(startOfDay(new Date('2026-06-15T14:32:00Z'), LDN)), '2026-06-14T23:00:00.000Z')
})

test('an instant just after local midnight in summer belongs to that day', () => {
  assert.equal(iso(startOfDay(new Date('2026-06-14T23:30:00Z'), LDN)), '2026-06-14T23:00:00.000Z')
})

test('an instant just before local midnight in summer belongs to the previous day', () => {
  assert.equal(iso(startOfDay(new Date('2026-06-14T22:30:00Z'), LDN)), '2026-06-13T23:00:00.000Z')
})

test('addDays crossing the spring DST change adds calendar days, not 24h blocks', () => {
  // UK clocks go forward on 29 March 2026. Local midnight on the 28th is
  // 00:00Z (GMT); local midnight on the 30th is 23:00Z on the 29th (BST).
  // That is 47 hours apart, so adding 2 x 24h would land an hour late.
  const from = startOfDay(new Date('2026-03-28T12:00:00Z'), LDN)
  assert.equal(iso(from), '2026-03-28T00:00:00.000Z')
  assert.equal(iso(addDays(from, 2, LDN)), '2026-03-29T23:00:00.000Z')
})

test('addDays crossing the autumn DST change stays on local midnight', () => {
  // Clocks go back on 25 October 2026: that local day is 25 hours long.
  const from = startOfDay(new Date('2026-10-24T12:00:00Z'), LDN)
  assert.equal(iso(from), '2026-10-23T23:00:00.000Z')
  assert.equal(iso(addDays(from, 2, LDN)), '2026-10-26T00:00:00.000Z')
})

test('startOfWeek returns Monday local midnight', () => {
  // 2026-06-17 is a Wednesday; the ISO week opens Monday 2026-06-15.
  assert.equal(iso(startOfWeek(new Date('2026-06-17T09:00:00Z'), LDN)), '2026-06-14T23:00:00.000Z')
})

test('startOfWeek on a Monday returns that same day', () => {
  assert.equal(iso(startOfWeek(new Date('2026-06-15T09:00:00Z'), LDN)), '2026-06-14T23:00:00.000Z')
})

test('startOfWeek on a Sunday returns the Monday six days earlier', () => {
  // Sunday closes the ISO week rather than opening it.
  assert.equal(iso(startOfWeek(new Date('2026-06-21T09:00:00Z'), LDN)), '2026-06-14T23:00:00.000Z')
})

test('startOfMonth and startOfYear respect the zone', () => {
  assert.equal(iso(startOfMonth(new Date('2026-06-17T09:00:00Z'), LDN)), '2026-05-31T23:00:00.000Z')
  assert.equal(iso(startOfYear(new Date('2026-06-17T09:00:00Z'), LDN)), '2026-01-01T00:00:00.000Z')
})

test('addMonths clamps rather than overflowing into the next month', () => {
  // 31 March minus one month is 28 February 2026, not 3 March.
  const march31 = startOfDay(new Date('2026-03-31T12:00:00Z'), LDN)
  assert.equal(iso(addMonths(march31, -1, LDN)), '2026-02-28T00:00:00.000Z')
})

test('addMonths clamps into a leap February', () => {
  const jan31 = startOfDay(new Date('2028-01-31T12:00:00Z'), LDN)
  assert.equal(iso(addMonths(jan31, 1, LDN)), '2028-02-29T00:00:00.000Z')
})

test('zonedTimeToUtc round-trips a winter and a summer wall clock', () => {
  assert.equal(iso(zonedTimeToUtc(2026, 1, 15, 9, 30, 0, LDN)), '2026-01-15T09:30:00.000Z')
  assert.equal(iso(zonedTimeToUtc(2026, 6, 15, 9, 30, 0, LDN)), '2026-06-15T08:30:00.000Z')
})

test('7d covers seven local days ending with today', () => {
  const now = new Date('2026-06-17T14:00:00Z')
  const period = resolvePeriod('7d', LDN, now)
  assert.equal(iso(period.from), '2026-06-10T23:00:00.000Z')
  // Exclusive upper bound at the start of tomorrow, so two cards rendered a
  // second apart cannot disagree about where "now" is.
  assert.equal(iso(period.to), '2026-06-17T23:00:00.000Z')
  assert.equal(bucketStarts(period, 'day', LDN).length, 7)
})

test('the previous 7d window abuts the current one without overlapping', () => {
  const period = resolvePeriod('7d', LDN, new Date('2026-06-17T14:00:00Z'))
  assert.ok(period.previous)
  assert.equal(iso(period.previous.to), iso(period.from))
  assert.equal(iso(period.previous.from), '2026-06-03T23:00:00.000Z')
})

test('30d and 90d span the number of CALENDAR days they claim', () => {
  // Counted as day buckets, not as elapsed milliseconds divided by 86400000.
  // A 90 day window ending 17 June opens on 20 March and so crosses the
  // spring DST change, making it 90 calendar days but only 89 days and 23
  // hours of elapsed time. Counting fixed 24h blocks is the very error this
  // module exists to avoid.
  for (const [id, expected] of [['30d', 30], ['90d', 90]] as const) {
    const p = resolvePeriod(id, LDN, new Date('2026-06-17T14:00:00Z'))
    assert.equal(bucketStarts(p, 'day', LDN).length, expected)
  }
})

test('a window crossing a DST change is not a whole number of 24h blocks', () => {
  // Documents the consequence of the rule above rather than hiding it: the
  // boundaries are correct local midnights, so the elapsed time between them
  // is deliberately not a multiple of 24 hours.
  const p = resolvePeriod('90d', LDN, new Date('2026-06-17T14:00:00Z'))
  const elapsedHours = (p.to.getTime() - p.from.getTime()) / 3_600_000
  assert.equal(elapsedHours, 90 * 24 - 1)
  assert.equal(bucketStarts(p, 'day', LDN).length, 90)
})

test('12m starts at the first of the month eleven months back', () => {
  // 1 July 2025 falls in British Summer Time, so its local midnight is
  // 23:00Z on 30 June rather than 00:00Z on the 1st.
  const p = resolvePeriod('12m', LDN, new Date('2026-06-17T14:00:00Z'))
  assert.equal(iso(p.from), '2025-06-30T23:00:00.000Z')
})

test('ytd starts on 1 January and offers no comparison window', () => {
  const p = resolvePeriod('ytd', LDN, new Date('2026-06-17T14:00:00Z'))
  assert.equal(iso(p.from), '2026-01-01T00:00:00.000Z')
  // The prior year to date is a different length in a leap year, so a
  // comparison would quietly mislead rather than inform.
  assert.equal(p.previous, null)
})

test('all starts at the data epoch and offers no comparison window', () => {
  const p = resolvePeriod('all', LDN, new Date('2026-06-17T14:00:00Z'))
  assert.equal(iso(p.from), '2026-08-07T00:00:00.000Z')
  assert.equal(p.previous, null)
})

test('a custom range includes its end day in full', () => {
  const p = resolvePeriod('custom', LDN, new Date('2026-06-17T14:00:00Z'), {
    from: new Date('2026-06-01T00:00:00Z'),
    to: new Date('2026-06-03T00:00:00Z'),
  })
  assert.equal(iso(p.from), '2026-05-31T23:00:00.000Z')
  // Exclusive bound sits at the start of 4 June, so 3 June counts in full.
  assert.equal(iso(p.to), '2026-06-03T23:00:00.000Z')
})

test('a custom period without a range is rejected rather than guessed', () => {
  assert.throws(() => resolvePeriod('custom', LDN, new Date('2026-06-17T14:00:00Z')))
})

test('bucketStarts covers a week at day grouping with no gaps or repeats', () => {
  const p = resolvePeriod('7d', LDN, new Date('2026-06-17T14:00:00Z'))
  const buckets = bucketStarts(p, 'day', LDN)
  assert.equal(buckets.length, 7)
  assert.equal(iso(buckets[0]), '2026-06-10T23:00:00.000Z')
  assert.equal(iso(buckets[6]), '2026-06-16T23:00:00.000Z')
  const unique = new Set(buckets.map(iso))
  assert.equal(unique.size, 7)
})

test('bucketStarts at month grouping returns twelve months for 12m', () => {
  const p = resolvePeriod('12m', LDN, new Date('2026-06-17T14:00:00Z'))
  assert.equal(bucketStarts(p, 'month', LDN).length, 12)
})

test('bucketStarts never runs past the exclusive upper bound', () => {
  const p = resolvePeriod('30d', LDN, new Date('2026-06-17T14:00:00Z'))
  for (const b of bucketStarts(p, 'day', LDN)) assert.ok(b < p.to)
})

test('a zone ahead of UTC can put an instant on the following local day', () => {
  // Pacific/Auckland is UTC+12 in June (New Zealand DST runs Sep-Apr), so
  // 14:32Z on the 15th is already 02:32 on the 16th locally. The day that
  // contains it therefore opens at midday UTC on the 15th.
  assert.equal(
    iso(startOfDay(new Date('2026-06-15T14:32:00Z'), 'Pacific/Auckland')),
    '2026-06-15T12:00:00.000Z',
  )
})

test('UTC behaves as the trivial case', () => {
  assert.equal(iso(startOfDay(new Date('2026-06-15T14:32:00Z'), 'UTC')), '2026-06-15T00:00:00.000Z')
})

test('isValidTimeZone accepts real zones and rejects nonsense', () => {
  assert.equal(isValidTimeZone('Europe/London'), true)
  assert.equal(isValidTimeZone('UTC'), true)
  assert.equal(isValidTimeZone('Not/AZone'), false)
})

console.log(`\n${passed} tests passed`)
