import { supabase } from '@/lib/supabase'

/**
 * Aggregates from public.landing_stats (see migration
 * 20260829002146_landing_stats_view): counts over completed checks only,
 * computed in the database so the published numbers can never drift from
 * the truth. Nothing row-level, nothing per-user.
 */
export interface LandingStats {
  checksCompleted: number
  accounts: number
  rolesCovered: number
  /** Average score movement between a user's first and latest completed check on the same job title; null until any user has rerun one. */
  avgRerunScoreDelta: number | null
  rerunPairs: number
  medianMinutesToVerdict: number | null
}

export async function getLandingStats(): Promise<LandingStats> {
  const { data, error } = await supabase
    .from('landing_stats')
    .select(
      'checks_completed, accounts, roles_covered, avg_rerun_score_delta, rerun_pairs, median_minutes_to_verdict',
    )
    .single()

  if (error) throw error

  return {
    checksCompleted: data.checks_completed as number,
    accounts: data.accounts as number,
    rolesCovered: data.roles_covered as number,
    avgRerunScoreDelta: data.avg_rerun_score_delta as number | null,
    rerunPairs: data.rerun_pairs as number,
    medianMinutesToVerdict: data.median_minutes_to_verdict as number | null,
  }
}

/**
 * The floor below which the numbers stay off the page entirely. "7 checks
 * run" costs more trust than the empty space it fills; roughly 250 checks
 * across 100 accounts is where "checks run" stops sounding like a beta.
 * Pure and exported so the gate is testable without a component render.
 */
export const STATS_FLOOR = { checksCompleted: 250, accounts: 100 } as const

export function clearsStatsFloor(stats: Pick<LandingStats, 'checksCompleted' | 'accounts'>): boolean {
  return stats.checksCompleted >= STATS_FLOOR.checksCompleted && stats.accounts >= STATS_FLOOR.accounts
}
