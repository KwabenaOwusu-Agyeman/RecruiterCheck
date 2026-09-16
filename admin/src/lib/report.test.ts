// Run with: npx tsx admin/src/lib/report.test.ts
import assert from 'node:assert/strict'
import {
  REPORT_VIEWED_ACTION,
  canViewReports,
  isCheckId,
  normaliseReportSection,
  reportViewAuditEntry,
} from './report'

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

test('a stored string array is returned trimmed, blanks dropped', () => {
  assert.deepEqual(
    normaliseReportSection(['  Clear product ownership  ', '', '   ', 'Strong SQL']),
    ['Clear product ownership', 'Strong SQL'],
  )
})

test('objects with a text field are read, other items are skipped', () => {
  assert.deepEqual(
    normaliseReportSection([{ text: 'Quantify the migration' }, { title: 'no text' }, 42, null, ['nested']]),
    ['Quantify the migration'],
  )
})

test('a missing or non array section renders as empty rather than throwing', () => {
  assert.deepEqual(normaliseReportSection(null), [])
  assert.deepEqual(normaliseReportSection(undefined), [])
  assert.deepEqual(normaliseReportSection('a string'), [])
  assert.deepEqual(normaliseReportSection({ strengths: ['x'] }), [])
})

test('the audit entry for a report view carries identifiers only', () => {
  const entry = reportViewAuditEntry('chk_123')
  assert.equal(entry.action, REPORT_VIEWED_ACTION)
  assert.equal(entry.targetType, 'check')
  assert.equal(entry.targetId, 'chk_123')
  // No before or after snapshot: the report text must never reach the log.
  assert.deepEqual(Object.keys(entry).sort(), ['action', 'reason', 'targetId', 'targetType'])
})

test('only the owner role may view reports', () => {
  assert.equal(canViewReports('owner'), true)
  assert.equal(canViewReports('admin'), false)
  assert.equal(canViewReports('Owner'), false)
  assert.equal(canViewReports(''), false)
  assert.equal(canViewReports(null), false)
  assert.equal(canViewReports(undefined), false)
})

test('only a well formed uuid is accepted as a check id', () => {
  assert.equal(isCheckId('3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'), true)
  assert.equal(isCheckId('not-a-uuid'), false)
  assert.equal(isCheckId("3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e' or 1=1"), false)
  assert.equal(isCheckId(''), false)
})

console.log(`\n${passed} tests passed`)
