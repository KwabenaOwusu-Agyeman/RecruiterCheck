import 'server-only'
import { summariseOutcomes, type OutcomeRow, type OutcomesSummary } from '@/lib/outcomes'
import type { Db } from '../supabase'
import { ROW_CAP, readRows } from './primitives'

interface JoinedRow extends Omit<OutcomeRow, 'score' | 'job_title'> {
  checks: { job_title: string | null; interview_probability_score: number | null } | null
}

export type OutcomesData = { ok: true; summary: OutcomesSummary } | { ok: false; reason: string }

/**
 * Lifetime outcome figures. followup_token is deliberately not selected, and
 * neither is anything that identifies a user: the page shows aggregates only.
 */
export async function loadOutcomes(db: Db): Promise<OutcomesData> {
  const result = await readRows<JoinedRow>(
    db
      .from('application_outcomes')
      .select(
        'responded_at, withdrawn_at, followup_sent_at, applied, channel, stage, days_to_reply, salary_offered, salary_currency, salary_country, checks!inner(job_title, interview_probability_score)',
      )
      .limit(ROW_CAP),
  )
  if (!result.ok) return result

  const rows: OutcomeRow[] = result.rows.map(({ checks, ...rest }) => ({
    ...rest,
    salary_offered: rest.salary_offered === null ? null : Number(rest.salary_offered),
    score: checks?.interview_probability_score ?? null,
    job_title: checks?.job_title ?? null,
  }))
  return { ok: true, summary: summariseOutcomes(rows) }
}
