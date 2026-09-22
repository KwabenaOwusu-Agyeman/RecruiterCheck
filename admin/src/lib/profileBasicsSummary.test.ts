// Run with: npx tsx admin/src/lib/profileBasicsSummary.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  experienceBand,
  humanise,
  summariseProfileBasics,
  type ProfileBasicsRow,
} from './profileBasicsSummary'

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

const row = (patch: Partial<ProfileBasicsRow> = {}): ProfileBasicsRow => ({
  seniority: null,
  country: null,
  years_experience: null,
  industry: null,
  employment_status: null,
  education_level: null,
  needs_work_permit: null,
  ...patch,
})

test('an empty table reports nothing saved and no breakdowns', () => {
  const out = summariseProfileBasics([])
  assert.deepEqual(out.saved, { available: true, value: 0 })
  for (const key of ['bySeniority', 'byCountry', 'byIndustry', 'byEmployment', 'byEducation', 'byExperience', 'needsWorkPermit'] as const) {
    assert.deepEqual(out[key], [], key)
  }
})

test('stored values are shown readably', () => {
  assert.equal(humanise('self_employed'), 'Self employed')
  assert.equal(humanise('head_or_director'), 'Head or director')
  assert.equal(humanise('mid'), 'Mid')
})

test('the grouped country codes are named, real codes are left as they are', () => {
  const out = summariseProfileBasics([row({ country: 'XE' }), row({ country: 'XX' }), row({ country: 'NL' })])
  assert.deepEqual(
    out.byCountry.map((s) => s.label).sort(),
    ['Elsewhere in Europe', 'NL', 'Somewhere else'],
  )
})

test('blank answers are left out of a breakdown rather than counted as a group', () => {
  const out = summariseProfileBasics([row({ seniority: 'mid' }), row(), row()])
  assert.deepEqual(out.saved, { available: true, value: 3 })
  assert.deepEqual(out.bySeniority, [{ label: 'Mid', count: 1, share: 100 }])
})

test('experience bands cover the range in order', () => {
  assert.equal(experienceBand(null), null)
  assert.equal(experienceBand(0), 'Under 1 year')
  assert.equal(experienceBand(1), '1 to 3 years')
  assert.equal(experienceBand(3), '1 to 3 years')
  assert.equal(experienceBand(4), '4 to 6 years')
  assert.equal(experienceBand(10), '7 to 10 years')
  assert.equal(experienceBand(11), 'Over 10 years')

  const out = summariseProfileBasics([
    row({ years_experience: 12 }),
    row({ years_experience: 2 }),
    row({ years_experience: 0 }),
  ])
  assert.deepEqual(out.byExperience.map((s) => s.label), ['Under 1 year', '1 to 3 years', 'Over 10 years'])
})

test('shares are out of the people who answered, not out of everyone', () => {
  // Three of the four saved a row; the fourth left industry blank. A share of
  // 66% means two thirds of those who answered, which is what the page says.
  const out = summariseProfileBasics([
    row({ industry: 'finance' }),
    row({ industry: 'finance' }),
    row({ industry: 'media' }),
    row(),
  ])
  assert.deepEqual(out.byIndustry.map((s) => [s.label, s.count]), [
    ['Finance', 2],
    ['Media', 1],
  ])
  assert.ok(Math.abs(out.byIndustry[0].share - 200 / 3) < 0.001)
  assert.ok(Math.abs(out.byIndustry[1].share - 100 / 3) < 0.001)
})

test('the work permit question reads as words, not true and false', () => {
  const out = summariseProfileBasics([row({ needs_work_permit: true }), row({ needs_work_permit: false })])
  assert.deepEqual(out.needsWorkPermit.map((s) => s.label).sort(), ['Needs a permit', 'No permit needed'])
})

/** Strips line comments, so a guard asserts on code rather than on prose. */
function withoutComments(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n')
}

test('the free text role is never read into this app', () => {
  const files = ['admin/src/lib/profileBasicsSummary.ts', 'admin/src/server/metrics/profileBasics.ts']
  for (const file of files) {
    const code = withoutComments(readFileSync(file, 'utf8'))
    assert.ok(!code.includes('target_role'), `${file} must not select or summarise target_role`)
  }
})

console.log(`\n${passed} tests passed`)
