// Run with: npx tsx src/lib/profileBasics.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  COUNTRY_OPTIONS,
  EDUCATION_LEVEL_OPTIONS,
  EMPLOYMENT_STATUS_OPTIONS,
  EMPTY_PROFILE_BASICS_FORM,
  INDUSTRY_OPTIONS,
  MAX_TARGET_ROLE_LENGTH,
  PROFILE_BASICS_CONSENT_TEXT,
  SENIORITY_OPTIONS,
  buildProfileBasicsPayload,
  describeProfileBasics,
  hasAnyProfileBasics,
  toProfileBasicsForm,
  type ProfileBasicsForm,
} from './profileBasics'

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

const form = (patch: Partial<ProfileBasicsForm> = {}): ProfileBasicsForm => ({
  ...EMPTY_PROFILE_BASICS_FORM,
  ...patch,
})

test('an untouched form stores nothing at all', () => {
  const payload = buildProfileBasicsPayload(form())
  assert.ok(Object.values(payload).every((value) => value === null))
  assert.equal(hasAnyProfileBasics(form()), false)
  assert.equal(describeProfileBasics(form()), 'Nothing saved yet')
})

test('a filled form is stored field by field', () => {
  const payload = buildProfileBasicsPayload(
    form({
      targetRole: '  Data   Analyst  ',
      seniority: 'mid',
      country: 'NL',
      yearsExperience: '4',
      industry: 'finance',
      employmentStatus: 'seeking',
      educationLevel: 'master',
      needsWorkPermit: 'no',
    }),
  )
  assert.deepEqual(payload, {
    target_role: 'Data Analyst',
    seniority: 'mid',
    country: 'NL',
    years_experience: 4,
    industry: 'finance',
    employment_status: 'seeking',
    education_level: 'master',
    needs_work_permit: false,
  })
  assert.equal(describeProfileBasics(form({ targetRole: 'x', country: 'NL' })), '2 of 8 details saved')
})

test('a value that is not on the list is dropped, never stored', () => {
  const payload = buildProfileBasicsPayload(
    form({ seniority: 'ceo', industry: 'crypto', employmentStatus: 'retired', educationLevel: 'phd', country: 'ZZ' }),
  )
  assert.equal(payload.seniority, null)
  assert.equal(payload.industry, null)
  assert.equal(payload.employment_status, null)
  assert.equal(payload.education_level, null)
  assert.equal(payload.country, null)
})

test('years of experience accepts only whole numbers in range', () => {
  assert.equal(buildProfileBasicsPayload(form({ yearsExperience: '0' })).years_experience, 0)
  assert.equal(buildProfileBasicsPayload(form({ yearsExperience: '60' })).years_experience, 60)
  for (const bad of ['', ' ', '-1', '61', '4.5', 'four']) {
    assert.equal(buildProfileBasicsPayload(form({ yearsExperience: bad })).years_experience, null, bad)
  }
})

test('a very long role is cut to the length the column accepts', () => {
  const payload = buildProfileBasicsPayload(form({ targetRole: 'a'.repeat(400) }))
  assert.equal(payload.target_role?.length, MAX_TARGET_ROLE_LENGTH)
})

test('the two grouped country options are stored in the private code range', () => {
  assert.equal(buildProfileBasicsPayload(form({ country: 'OTHER_EU' })).country, 'XE')
  assert.equal(buildProfileBasicsPayload(form({ country: 'OTHER' })).country, 'XX')
  for (const option of COUNTRY_OPTIONS) {
    const stored = buildProfileBasicsPayload(form({ country: option.value })).country
    assert.match(stored ?? '', /^[A-Z]{2}$/, option.value)
  }
})

test('a saved row reads back into the same form values', () => {
  const original = form({
    targetRole: 'Product Manager',
    seniority: 'senior',
    country: 'OTHER_EU',
    yearsExperience: '9',
    industry: 'media',
    employmentStatus: 'employed',
    educationLevel: 'bachelor',
    needsWorkPermit: 'yes',
  })
  assert.deepEqual(toProfileBasicsForm(buildProfileBasicsPayload(original)), original)
  assert.deepEqual(toProfileBasicsForm(null), EMPTY_PROFILE_BASICS_FORM)
})

test('no field is collected that the decision rules out', () => {
  const keys = Object.keys(buildProfileBasicsPayload(form()))
  for (const banned of ['age', 'date_of_birth', 'gender', 'ethnicity', 'religion', 'health', 'disability']) {
    assert.ok(!keys.some((key) => key.includes(banned)), banned)
  }
})

// The option lists and the migration's check constraints have to agree, or a
// legitimate choice is refused by the database at save time.
const migration = readFileSync('supabase/migrations/20260922210000_profile_basics.sql', 'utf8')

function constraintValues(column: string): string[] {
  const match = migration.match(new RegExp(`${column} text check \\(${column} in \\(([^)]*)\\)`, 's'))
  assert.ok(match, `no check constraint found for ${column}`)
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
}

test('every option the form offers is accepted by the database', () => {
  const pairs: [string, readonly { value: string }[]][] = [
    ['seniority', SENIORITY_OPTIONS],
    ['industry', INDUSTRY_OPTIONS],
    ['employment_status', EMPLOYMENT_STATUS_OPTIONS],
    ['education_level', EDUCATION_LEVEL_OPTIONS],
  ]
  for (const [column, options] of pairs) {
    assert.deepEqual(
      options.map((o) => o.value).sort(),
      constraintValues(column),
      `${column} options and migration disagree`,
    )
  }
})

test('user facing copy contains no dashes and labels stop short of a wall of text', () => {
  const copy = [
    PROFILE_BASICS_CONSENT_TEXT,
    ...[...SENIORITY_OPTIONS, ...INDUSTRY_OPTIONS, ...EMPLOYMENT_STATUS_OPTIONS, ...EDUCATION_LEVEL_OPTIONS, ...COUNTRY_OPTIONS].map(
      (o) => o.label,
    ),
  ]
  for (const text of copy) {
    assert.ok(!/[‒–—―]| - /.test(text), text)
    assert.ok(text.length <= 320, text)
  }
})

console.log(`\n${passed} tests passed`)
