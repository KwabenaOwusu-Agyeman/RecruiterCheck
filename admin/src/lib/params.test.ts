// Run with: npx tsx admin/src/lib/params.test.ts
import assert from 'node:assert/strict'
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_PERIOD,
  MAX_PAGE_SIZE,
  escapeLikeTerm,
  pageRange,
  parseCustomRange,
  parseGrouping,
  parsePage,
  parsePageSize,
  parsePeriod,
  parseSearch,
  totalPages,
} from './params'

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

test('a known period is accepted', () => {
  assert.equal(parsePeriod('7d'), '7d')
  assert.equal(parsePeriod('all'), 'all')
})

test('an unknown or absent period falls back to the default', () => {
  assert.equal(parsePeriod('; drop table checks'), DEFAULT_PERIOD)
  assert.equal(parsePeriod(undefined), DEFAULT_PERIOD)
  assert.equal(parsePeriod(''), DEFAULT_PERIOD)
})

test('grouping is validated against the allowed set', () => {
  assert.equal(parseGrouping('month'), 'month')
  assert.equal(parseGrouping('decade'), 'day')
  assert.equal(parseGrouping(undefined, 'week'), 'week')
})

test('page numbers are 1-based and reject nonsense', () => {
  assert.equal(parsePage('3'), 3)
  assert.equal(parsePage('0'), 1)
  assert.equal(parsePage('-5'), 1)
  assert.equal(parsePage('abc'), 1)
  assert.equal(parsePage(undefined), 1)
})

test('an absurd page number is clamped rather than passed to the database', () => {
  // An unbounded offset is a cheap way to make the database do expensive work.
  assert.equal(parsePage('99999999'), 10_000)
})

test('page size is clamped to the maximum', () => {
  assert.equal(parsePageSize('50'), 50)
  assert.equal(parsePageSize('100000'), MAX_PAGE_SIZE)
  assert.equal(parsePageSize('0'), DEFAULT_PAGE_SIZE)
  assert.equal(parsePageSize(undefined), DEFAULT_PAGE_SIZE)
})

test('pageRange produces inclusive offsets', () => {
  assert.deepEqual(pageRange(1, 25), { from: 0, to: 24 })
  assert.deepEqual(pageRange(2, 25), { from: 25, to: 49 })
  assert.deepEqual(pageRange(3, 10), { from: 20, to: 29 })
})

test('totalPages is at least one even with no rows', () => {
  // An empty table should render "page 1 of 1", not "page 1 of 0".
  assert.equal(totalPages(0, 25), 1)
  assert.equal(totalPages(25, 25), 1)
  assert.equal(totalPages(26, 25), 2)
})

test('search is trimmed, bounded, and empty becomes null', () => {
  assert.equal(parseSearch('  jane  '), 'jane')
  assert.equal(parseSearch('   '), null)
  assert.equal(parseSearch(undefined), null)
  assert.equal(parseSearch('x'.repeat(500))?.length, 200)
})

test('SQL wildcards in a search term are escaped, not passed through', () => {
  // Unescaped, "%" matches everything, quietly turning a search into a dump.
  assert.equal(escapeLikeTerm('100%'), '100\\%')
  assert.equal(escapeLikeTerm('a_b'), 'a\\_b')
  assert.equal(escapeLikeTerm('back\\slash'), 'back\\\\slash')
})

test('PostgREST filter metacharacters are neutralised', () => {
  // A comma separates values and parentheses group them inside a filter, so an
  // unescaped term either errors or matches more than intended.
  assert.equal(escapeLikeTerm('a,b'), 'a b')
  assert.equal(escapeLikeTerm('(or)'), ' or ')
})

test('a valid custom range is parsed', () => {
  const range = parseCustomRange('2026-06-01', '2026-06-30')
  assert.ok(range)
  assert.equal(range.from.toISOString().slice(0, 10), '2026-06-01')
})

test('an invalid or reversed custom range is rejected', () => {
  assert.equal(parseCustomRange('nonsense', '2026-06-30'), null)
  assert.equal(parseCustomRange('2026-06-30', '2026-06-01'), null)
  assert.equal(parseCustomRange(undefined, '2026-06-30'), null)
})

console.log(`\n${passed} tests passed`)
