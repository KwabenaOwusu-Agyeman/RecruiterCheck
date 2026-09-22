// Profile basics: the opt in details a user can add on the Account page.
//
// Build item 2 of the Decision Log entry "Data strategy: what we collect, for
// product value and exit readiness" (approved 2026-09-16). Every field is
// optional, nothing here affects a score, and the user can clear the lot.
//
// The option values here must match the check constraints in
// 20260922210000_profile_basics.sql. profileBasics.test.ts asserts that
// against the migration file, so the two cannot drift apart silently.

/** Bump whenever PROFILE_BASICS_CONSENT_TEXT changes. Stored on every row. */
export const PROFILE_BASICS_CONSENT_VERSION = '2026-09-22'

export const PROFILE_BASICS_CONSENT_TEXT =
  'Save these details with my account so MyRecruiterCheck can improve its checks, and use them, anonymised and combined with other people, in job market insights. I can change or delete them at any time.'

export const SENIORITY_OPTIONS = [
  { value: 'student', label: 'Student or graduate' },
  { value: 'entry', label: 'Entry level' },
  { value: 'mid', label: 'Mid level' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead or manager' },
  { value: 'head_or_director', label: 'Head or director' },
] as const

export const INDUSTRY_OPTIONS = [
  { value: 'technology', label: 'Technology' },
  { value: 'finance', label: 'Finance' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'education', label: 'Education' },
  { value: 'government', label: 'Government' },
  { value: 'retail', label: 'Retail' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'energy', label: 'Energy' },
  { value: 'media', label: 'Media' },
  { value: 'nonprofit', label: 'Nonprofit' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'other', label: 'Other' },
] as const

export const EMPLOYMENT_STATUS_OPTIONS = [
  { value: 'employed', label: 'Employed' },
  { value: 'self_employed', label: 'Self employed' },
  { value: 'seeking', label: 'Looking for work' },
  { value: 'student', label: 'Studying' },
  { value: 'other', label: 'Other' },
] as const

export const EDUCATION_LEVEL_OPTIONS = [
  { value: 'secondary', label: 'Secondary school' },
  { value: 'vocational', label: 'Vocational' },
  { value: 'bachelor', label: 'Bachelor' },
  { value: 'master', label: 'Master' },
  { value: 'doctorate', label: 'Doctorate' },
  { value: 'other', label: 'Other' },
] as const

export const COUNTRY_OPTIONS = [
  { value: 'NL', label: 'Netherlands' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'DE', label: 'Germany' },
  { value: 'BE', label: 'Belgium' },
  { value: 'FR', label: 'France' },
  { value: 'IE', label: 'Ireland' },
  { value: 'ES', label: 'Spain' },
  { value: 'IT', label: 'Italy' },
  { value: 'PL', label: 'Poland' },
  { value: 'SE', label: 'Sweden' },
  { value: 'CH', label: 'Switzerland' },
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
  { value: 'IN', label: 'India' },
  { value: 'PK', label: 'Pakistan' },
  { value: 'NG', label: 'Nigeria' },
  { value: 'KE', label: 'Kenya' },
  { value: 'GH', label: 'Ghana' },
  { value: 'ZA', label: 'South Africa' },
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'BR', label: 'Brazil' },
  { value: 'OTHER_EU', label: 'Elsewhere in Europe' },
  { value: 'OTHER', label: 'Somewhere else' },
] as const

export const MAX_TARGET_ROLE_LENGTH = 120
export const MAX_YEARS_EXPERIENCE = 60

export interface ProfileBasicsForm {
  targetRole: string
  seniority: string
  country: string
  yearsExperience: string
  industry: string
  employmentStatus: string
  educationLevel: string
  needsWorkPermit: '' | 'yes' | 'no'
}

export const EMPTY_PROFILE_BASICS_FORM: ProfileBasicsForm = {
  targetRole: '',
  seniority: '',
  country: '',
  yearsExperience: '',
  industry: '',
  employmentStatus: '',
  educationLevel: '',
  needsWorkPermit: '',
}

export interface ProfileBasicsRecord {
  target_role: string | null
  seniority: string | null
  country: string | null
  years_experience: number | null
  industry: string | null
  employment_status: string | null
  education_level: string | null
  needs_work_permit: boolean | null
}

/**
 * Two of the country options are groupings rather than countries, so they are
 * stored with the same two letter shape the column accepts. XE and XX are the
 * user assigned ISO 3166 range, which no real country can ever take.
 */
const COUNTRY_CODE_BY_OPTION: Record<string, string> = { OTHER_EU: 'XE', OTHER: 'XX' }
const OPTION_BY_COUNTRY_CODE: Record<string, string> = { XE: 'OTHER_EU', XX: 'OTHER' }

function pick(value: string, options: readonly { value: string }[]): string | null {
  return options.some((option) => option.value === value) ? value : null
}

/** The row to save. Anything left blank or unrecognised is stored as null. */
export function buildProfileBasicsPayload(form: ProfileBasicsForm): ProfileBasicsRecord {
  const role = form.targetRole.trim().replace(/\s+/g, ' ')
  const years = Number(form.yearsExperience)
  const countryOption = pick(form.country, COUNTRY_OPTIONS)

  return {
    target_role: role ? role.slice(0, MAX_TARGET_ROLE_LENGTH) : null,
    seniority: pick(form.seniority, SENIORITY_OPTIONS),
    country: countryOption ? (COUNTRY_CODE_BY_OPTION[countryOption] ?? countryOption) : null,
    years_experience:
      form.yearsExperience.trim() === '' ||
      !Number.isInteger(years) ||
      years < 0 ||
      years > MAX_YEARS_EXPERIENCE
        ? null
        : years,
    industry: pick(form.industry, INDUSTRY_OPTIONS),
    employment_status: pick(form.employmentStatus, EMPLOYMENT_STATUS_OPTIONS),
    education_level: pick(form.educationLevel, EDUCATION_LEVEL_OPTIONS),
    needs_work_permit: form.needsWorkPermit === '' ? null : form.needsWorkPermit === 'yes',
  }
}

/** The stored row as form values, for editing what was saved before. */
export function toProfileBasicsForm(record: ProfileBasicsRecord | null): ProfileBasicsForm {
  if (!record) return EMPTY_PROFILE_BASICS_FORM
  const country = record.country ? (OPTION_BY_COUNTRY_CODE[record.country] ?? record.country) : ''
  return {
    targetRole: record.target_role ?? '',
    seniority: record.seniority ?? '',
    country: pick(country, COUNTRY_OPTIONS) ?? '',
    yearsExperience: record.years_experience === null ? '' : String(record.years_experience),
    industry: record.industry ?? '',
    employmentStatus: record.employment_status ?? '',
    educationLevel: record.education_level ?? '',
    needsWorkPermit: record.needs_work_permit === null ? '' : record.needs_work_permit ? 'yes' : 'no',
  }
}

/** Saving an entirely empty form would store consent and nothing else. */
export function hasAnyProfileBasics(form: ProfileBasicsForm): boolean {
  const payload = buildProfileBasicsPayload(form)
  return Object.values(payload).some((value) => value !== null)
}

/** A short summary of what is stored, for the Account page. */
export function describeProfileBasics(form: ProfileBasicsForm): string {
  const payload = buildProfileBasicsPayload(form)
  const filled = Object.values(payload).filter((value) => value !== null).length
  const total = Object.keys(payload).length
  if (filled === 0) return 'Nothing saved yet'
  return `${filled} of ${total} details saved`
}
