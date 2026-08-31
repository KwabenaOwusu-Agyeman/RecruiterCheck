/**
 * Shape and interpretation of public.get_landing_stats() (see migration
 * 20260831141500_landing_stats_definer_function).
 *
 * Pure on purpose: no Supabase import, so the gating below is testable by
 * hand with tsx exactly as this repo's other test files run. The network
 * call lives in src/services/landingStatsService.ts.
 */

/**
 * One row as the function returns it. Declared here rather than taken from
 * the generated types because the type generator emits RETURNS TABLE
 * columns as non nullable, and every figure this function returns is null
 * below the publication floor.
 */
export interface LandingStatsRow {
  meets_floor: boolean | null
  checks_completed: number | null
  accounts: number | null
  roles_covered: number | null
  avg_rerun_score_delta: number | null
  rerun_pairs: number | null
  median_minutes_to_verdict: number | null
}

/**
 * A discriminated union rather than nullable fields, so a caller cannot
 * read a figure without having established that there is one to read.
 *
 * The floor itself lives in the SQL function and nowhere else. Below it the
 * server sends no figures at all, which is what stops the anon key from
 * being a window onto exact check volume.
 */
export type LandingStats =
  | { meetsFloor: false }
  | {
      meetsFloor: true
      checksCompleted: number
      accounts: number
      rolesCovered: number
      /** Average score movement between a user's first and latest completed check on the same job title; null until any user has rerun one. */
      avgRerunScoreDelta: number | null
      rerunPairs: number
      medianMinutesToVerdict: number | null
    }

/**
 * Below the floor, and on any row that claims to clear it without the
 * counts to back that up, this reports meetsFloor false. A malformed row
 * shows the product figures rather than a zero.
 */
export function toLandingStats(row: LandingStatsRow | null | undefined): LandingStats {
  if (
    !row ||
    row.meets_floor !== true ||
    row.checks_completed === null ||
    row.accounts === null ||
    row.roles_covered === null ||
    row.rerun_pairs === null
  ) {
    return { meetsFloor: false }
  }

  return {
    meetsFloor: true,
    checksCompleted: row.checks_completed,
    accounts: row.accounts,
    rolesCovered: row.roles_covered,
    avgRerunScoreDelta: row.avg_rerun_score_delta,
    rerunPairs: row.rerun_pairs,
    medianMinutesToVerdict: row.median_minutes_to_verdict,
  }
}
