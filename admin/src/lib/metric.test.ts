// Run with: npx tsx admin/src/lib/metric.test.ts
import assert from 'node:assert/strict'
import { available, compare, mean, median, rate, unavailable } from './metric'

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

test('compare reports absolute and percentage change', () => {
  const d = compare(available(120), available(100))
  assert.deepEqual(d, { absolute: 20, percent: 20, direction: 'up' })
})

test('compare reports a decrease', () => {
  const d = compare(available(80), available(100))
  assert.equal(d?.direction, 'down')
  assert.equal(d?.absolute, -20)
  assert.equal(d?.percent, -20)
})

test('compare reports flat', () => {
  assert.equal(compare(available(100), available(100))?.direction, 'flat')
})

test('growth from zero gives an absolute change but no percentage', () => {
  // 0 to 5 is not "infinite percent" and not "100%". Reporting either would be
  // inventing a number, so percent is null and the UI shows +5 alone.
  const d = compare(available(5), available(0))
  assert.equal(d?.absolute, 5)
  assert.equal(d?.percent, null)
  assert.equal(d?.direction, 'up')
})

test('zero to zero is flat with no percentage', () => {
  const d = compare(available(0), available(0))
  assert.equal(d?.percent, null)
  assert.equal(d?.direction, 'flat')
})

test('no comparison window means no delta', () => {
  // Year to date and all time deliberately have no previous window.
  assert.equal(compare(available(10), null), null)
})

test('an unavailable metric on either side yields no delta', () => {
  assert.equal(compare(unavailable('no instrumentation'), available(10)), null)
  assert.equal(compare(available(10), unavailable('no instrumentation')), null)
})

test('rate computes a percentage', () => {
  const r = rate(7, 10, 'no checks')
  assert.deepEqual(r, { available: true, value: 70 })
})

test('rate with a zero denominator is unavailable, never zero', () => {
  // "0% completion" and "no checks yet" look identical on a card and mean
  // opposite things.
  const r = rate(0, 0, 'no checks were started in this period')
  assert.equal(r.available, false)
  if (!r.available) assert.equal(r.reason, 'no checks were started in this period')
})

test('a rate can legitimately be zero when the denominator is not', () => {
  assert.deepEqual(rate(0, 10, 'no checks'), { available: true, value: 0 })
})

test('mean averages and reports an empty sample as unavailable', () => {
  assert.deepEqual(mean([2, 4, 6], 'empty'), { available: true, value: 4 })
  assert.equal(mean([], 'empty').available, false)
})

test('median takes the middle of an odd sample', () => {
  assert.deepEqual(median([5, 1, 3], 'empty'), { available: true, value: 3 })
})

test('median averages the middle pair of an even sample', () => {
  assert.deepEqual(median([1, 2, 3, 4], 'empty'), { available: true, value: 2.5 })
})

test('median resists a single outlier where mean does not', () => {
  // The reason processing time is reported as a median: one stuck job must not
  // make a normal day look slow.
  const sample = [10, 11, 12, 13, 4000]
  assert.deepEqual(median(sample, 'empty'), { available: true, value: 12 })
  const m = mean(sample, 'empty')
  assert.ok(m.available && m.value > 800)
})

test('median does not mutate its input', () => {
  const sample = [3, 1, 2]
  median(sample, 'empty')
  assert.deepEqual(sample, [3, 1, 2])
})

console.log(`\n${passed} tests passed`)
