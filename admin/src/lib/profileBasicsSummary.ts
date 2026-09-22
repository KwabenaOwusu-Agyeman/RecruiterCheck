// Aggregation for the profile basics section of the Audience page.
//
// Counts only. A row is never shown, and target_role is deliberately not read
// into this app at all: it is free text a user typed about themselves, and the
// operational questions here are all "how many", not "who" (Decision Log:
// "Data strategy: what we collect", 2026-09-16).

import { available, type Metric } from './metric'

export interface ProfileBasicsRow {
  seniority: string | null
  country: string | null
  years_experience: number | null
  industry: string | null
  employment_status: string | null
  education_level: string | null
  needs_work_permit: boolean | null
}

export interface Share {
  label: string
  count: number
  share: number
}

export interface ProfileBasicsSummary {
  saved: Metric
  bySeniority: Share[]
  byCountry: Share[]
  byIndustry: Share[]
  byEmployment: Share[]
  byEducation: Share[]
  byExperience: Share[]
  needsWorkPermit: Share[]
}

/** The two grouped country choices, stored in the private ISO code range. */
const COUNTRY_LABELS: Record<string, string> = { XE: 'Elsewhere in Europe', XX: 'Somewhere else' }

/** stored_value to something readable, without a second copy of every list. */
export function humanise(value: string): string {
  const spaced = value.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function experienceBand(years: number | null): string | null {
  if (years === null || !Number.isFinite(years)) return null
  if (years < 1) return 'Under 1 year'
  if (years <= 3) return '1 to 3 years'
  if (years <= 6) return '4 to 6 years'
  if (years <= 10) return '7 to 10 years'
  return 'Over 10 years'
}

function shares(values: (string | null)[], order?: readonly string[]): Share[] {
  const present = values.filter((v): v is string => v !== null)
  const counts = new Map<string, number>()
  for (const value of present) counts.set(value, (counts.get(value) ?? 0) + 1)
  const rows = [...counts.entries()].map(([label, count]) => ({
    label,
    count,
    share: present.length === 0 ? 0 : (count / present.length) * 100,
  }))
  if (order) {
    return rows.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label))
  }
  return rows.sort((a, b) => b.count - a.count)
}

const EXPERIENCE_ORDER = ['Under 1 year', '1 to 3 years', '4 to 6 years', '7 to 10 years', 'Over 10 years'] as const

export function summariseProfileBasics(rows: readonly ProfileBasicsRow[]): ProfileBasicsSummary {
  return {
    saved: available(rows.length),
    bySeniority: shares(rows.map((r) => (r.seniority ? humanise(r.seniority) : null))),
    byCountry: shares(rows.map((r) => (r.country ? (COUNTRY_LABELS[r.country] ?? r.country) : null))),
    byIndustry: shares(rows.map((r) => (r.industry ? humanise(r.industry) : null))),
    byEmployment: shares(rows.map((r) => (r.employment_status ? humanise(r.employment_status) : null))),
    byEducation: shares(rows.map((r) => (r.education_level ? humanise(r.education_level) : null))),
    byExperience: shares(rows.map((r) => experienceBand(r.years_experience)), EXPERIENCE_ORDER),
    needsWorkPermit: shares(
      rows.map((r) => (r.needs_work_permit === null ? null : r.needs_work_permit ? 'Needs a permit' : 'No permit needed')),
    ),
  }
}
