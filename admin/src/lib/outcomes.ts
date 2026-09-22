// Pure aggregation for the Outcomes page. Every figure here is a count or a
// summary across users; no row is ever returned individually. Salary is only
// reported for groups of MIN_GROUP_SIZE or more, so a single offer cannot be
// read back from the dashboard (Decision Log: "Data strategy: what we
// collect", 16 September 2026).

import { available, median, rate, unavailable, type Metric } from './metric'

export const MIN_GROUP_SIZE = 5

export interface OutcomeRow {
  responded_at: string | null
  withdrawn_at: string | null
  followup_sent_at: string | null
  applied: boolean | null
  channel: string | null
  stage: string | null
  days_to_reply: number | null
  salary_offered: number | null
  salary_currency: string | null
  salary_country: string | null
  score: number | null
  job_title: string | null
}

export interface Share {
  label: string
  count: number
  share: number
}

export interface ScoreBandRow {
  band: string
  applied: number
  interviews: Metric
}

export interface SalaryGroup {
  role: string
  country: string
  currency: string
  offers: number
  median: number
}

export interface OutcomesSummary {
  optedIn: Metric
  emailed: Metric
  answered: Metric
  withdrawn: Metric
  responseRate: Metric
  appliedRate: Metric
  interviewRate: Metric
  ghostRate: Metric
  medianDaysToReply: Metric
  byStage: Share[]
  byChannel: Share[]
  byScoreBand: ScoreBandRow[]
  salaries: SalaryGroup[]
  salaryGroupsHidden: number
}

const STAGE_LABELS: Record<string, string> = {
  no_reply: 'No reply',
  rejected: 'Rejected',
  interview: 'Interview',
  offer: 'Offer',
}

const CHANNEL_LABELS: Record<string, string> = {
  job_board: 'Job board',
  referral: 'Referral',
  company_site: 'Company website',
  other: 'Other',
}

export const SCORE_BANDS = ['Below 40', '40 to 59', '60 to 79', '80 and above'] as const

export function scoreBand(score: number | null): (typeof SCORE_BANDS)[number] | null {
  if (score === null || !Number.isFinite(score)) return null
  if (score < 40) return 'Below 40'
  if (score < 60) return '40 to 59'
  if (score < 80) return '60 to 79'
  return '80 and above'
}

/** An interview or an offer both mean the application got past the screen. */
function reachedInterview(stage: string | null): boolean {
  return stage === 'interview' || stage === 'offer'
}

function shares(values: string[], labels: Record<string, string>): Share[] {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()]
    .map(([key, count]) => ({
      label: labels[key] ?? key,
      count,
      share: values.length === 0 ? 0 : (count / values.length) * 100,
    }))
    .sort((a, b) => b.count - a.count)
}

function normaliseRole(title: string | null): string {
  return (title ?? '').trim().replace(/\s+/g, ' ').toLowerCase() || 'untitled'
}

export function summariseOutcomes(rows: readonly OutcomeRow[]): OutcomesSummary {
  const emailed = rows.filter((r) => r.followup_sent_at !== null)
  const answered = rows.filter((r) => r.responded_at !== null && r.applied !== null)
  const applied = answered.filter((r) => r.applied === true && r.stage !== null)

  const days = applied
    .map((r) => r.days_to_reply)
    .filter((d): d is number => typeof d === 'number')

  const byScoreBand: ScoreBandRow[] = SCORE_BANDS.map((band) => {
    const inBand = applied.filter((r) => scoreBand(r.score) === band)
    return {
      band,
      applied: inBand.length,
      interviews:
        inBand.length < MIN_GROUP_SIZE
          ? unavailable(`fewer than ${MIN_GROUP_SIZE} answers`)
          : rate(inBand.filter((r) => reachedInterview(r.stage)).length, inBand.length, 'no answers'),
    }
  })

  const groups = new Map<string, { role: string; country: string; currency: string; values: number[] }>()
  for (const r of applied) {
    if (r.stage !== 'offer' || r.salary_offered === null || !r.salary_currency || !r.salary_country) continue
    const role = normaliseRole(r.job_title)
    const key = `${role}|${r.salary_country}|${r.salary_currency}`
    const group = groups.get(key) ?? { role, country: r.salary_country, currency: r.salary_currency, values: [] }
    group.values.push(Number(r.salary_offered))
    groups.set(key, group)
  }
  const salaries: SalaryGroup[] = []
  let salaryGroupsHidden = 0
  for (const group of groups.values()) {
    if (group.values.length < MIN_GROUP_SIZE) {
      salaryGroupsHidden += 1
      continue
    }
    const m = median(group.values, 'none')
    if (m.available) {
      salaries.push({
        role: group.role,
        country: group.country,
        currency: group.currency,
        offers: group.values.length,
        median: m.value,
      })
    }
  }
  salaries.sort((a, b) => b.offers - a.offers)

  return {
    optedIn: available(rows.length),
    emailed: available(emailed.length),
    answered: available(answered.length),
    withdrawn: available(rows.filter((r) => r.withdrawn_at !== null).length),
    responseRate: rate(answered.length, emailed.length, 'no follow up emails sent yet'),
    appliedRate: rate(applied.length, answered.length, 'no answers yet'),
    interviewRate: rate(applied.filter((r) => reachedInterview(r.stage)).length, applied.length, 'no applications reported yet'),
    ghostRate: rate(applied.filter((r) => r.stage === 'no_reply').length, applied.length, 'no applications reported yet'),
    medianDaysToReply: median(days, 'no reply times reported yet'),
    byStage: shares(applied.map((r) => r.stage as string), STAGE_LABELS),
    byChannel: shares(
      applied.map((r) => r.channel).filter((c): c is string => c !== null),
      CHANNEL_LABELS,
    ),
    byScoreBand,
    salaries,
    salaryGroupsHidden,
  }
}
