import { supabase } from '@/lib/supabase'
import { toLandingStats, type LandingStatsRow, type LandingStats } from '@/lib/landingStats'

export type { LandingStats } from '@/lib/landingStats'

/**
 * Aggregates from public.get_landing_stats() (see migration
 * 20260831141500_landing_stats_definer_function): counts over completed
 * checks only, computed in the database so the published numbers can never
 * drift from the truth. Nothing row level, nothing per user.
 *
 * This replaced a public.landing_stats view that anon could select from
 * directly. The function enforces the publication floor itself, so below it
 * there is nothing to read: the anon key alone no longer reveals how many
 * checks the product has run.
 */
export async function getLandingStats(): Promise<LandingStats> {
  const { data, error } = await supabase.rpc('get_landing_stats').single()

  if (error) throw error

  // The type generator emits RETURNS TABLE columns as non nullable, which
  // is wrong for this function: every figure is null below the floor. The
  // cast hands the row to a mapper that treats each one as nullable.
  return toLandingStats(data as unknown as LandingStatsRow)
}
