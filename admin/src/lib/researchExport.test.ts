// Run with: npx tsx admin/src/lib/researchExport.test.ts
//
// Source level guards on the research export, which cannot be executed here
// (it imports next/server and the Supabase client). The same approach, and the
// same reason, as actionContract.test.ts.
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

/** Strips line comments, so a guard asserts on code rather than on prose. */
function withoutComments(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n')
}

const route = withoutComments(readFileSync('admin/src/app/export/research/route.ts', 'utf8'))
const metrics = withoutComments(readFileSync('admin/src/server/metrics/research.ts', 'utf8'))
const migration = readFileSync('supabase/migrations/20260922230000_research_consent.sql', 'utf8')

test('the export reads the anonymised view and no table', () => {
  assert.ok(route.includes(".from('research_checks')"))
  for (const table of ['checks', 'profiles', 'user_profile_basics', 'application_outcomes', 'research_consents']) {
    assert.ok(!route.includes(`.from('${table}')`), `export must not read ${table} directly`)
  }
})

test('the export is gated and audited', () => {
  const admin = route.indexOf('requireAdmin()')
  const query = route.indexOf(".from('research_checks')")
  assert.ok(admin > 0 && admin < query, 'authorisation must come first')
  assert.ok(route.includes("recordExport(admin, 'research'"), 'every download must reach the audit log')
  assert.equal((route.match(/recordExport\(/g) ?? []).length, 2, 'success and failure are both recorded')
})

test('no identifying column can appear in the file', () => {
  for (const column of ['email', 'full_name', 'user_id', 'company_name', 'job_description', 'cv_file_name', 'cv_storage_path', 'target_role', 'comment']) {
    assert.ok(!route.includes(column), `${column} must not be exported`)
  }
})

test('the view itself excludes identifiers and reduces dates to the month', () => {
  const view = migration.slice(migration.indexOf('create or replace view public.research_checks'))
  // Only the select list, so a join condition naming user_id (which is how the
  // consent is matched) is not mistaken for an exported column.
  const selectList = view.slice(view.indexOf('\nselect'), view.indexOf('\nfrom public.checks'))

  assert.ok(selectList.includes("date_trunc('month', c.created_at)"), 'dates must be reduced to the month')
  for (const forbidden of ['company_name', 'job_description', 'cv_file_name', 'cv_storage_path', 'user_id', 'email', 'target_role', 'comment']) {
    assert.ok(!selectList.includes(forbidden), `${forbidden} must not be a column of the research view`)
  }
  assert.ok(view.includes('rc.withdrawn_at is null'), 'a withdrawn consent must drop out of the dataset')
  assert.ok(view.includes("c.status = 'completed'"), 'only completed checks belong in the dataset')
})

test('the view is readable by the server role alone', () => {
  assert.ok(migration.includes('revoke all on public.research_checks from anon, authenticated'))
  assert.ok(migration.includes('grant select on public.research_checks to service_role'))
})

test('the Control Centre counts consents without reading a row', () => {
  assert.ok(metrics.includes("head: true"), 'counts only, never rows')
  assert.ok(!metrics.includes('readRows'), 'no consent row should be read into this app')
})

console.log(`\n${passed} tests passed`)
