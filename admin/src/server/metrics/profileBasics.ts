import 'server-only'
import { summariseProfileBasics, type ProfileBasicsRow, type ProfileBasicsSummary } from '@/lib/profileBasicsSummary'
import type { Db } from '../supabase'
import { ROW_CAP, readRows } from './primitives'

export type ProfileBasicsData = { ok: true; summary: ProfileBasicsSummary } | { ok: false; reason: string }

/**
 * Lifetime, not scoped to a period: these are current details about who uses
 * the product, and a window would answer a different question. The free text
 * target_role and the user id are deliberately not selected.
 */
export async function loadProfileBasics(db: Db): Promise<ProfileBasicsData> {
  const result = await readRows<ProfileBasicsRow>(
    db
      .from('user_profile_basics')
      .select('seniority, country, years_experience, industry, employment_status, education_level, needs_work_permit')
      .limit(ROW_CAP),
  )
  if (!result.ok) return result
  return { ok: true, summary: summariseProfileBasics(result.rows) }
}
