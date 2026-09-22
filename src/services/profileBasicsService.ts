import { supabase } from '@/lib/supabase'
import {
  PROFILE_BASICS_CONSENT_VERSION,
  buildProfileBasicsPayload,
  type ProfileBasicsForm,
  type ProfileBasicsRecord,
} from '@/lib/profileBasics'

const COLUMNS =
  'target_role, seniority, country, years_experience, industry, employment_status, education_level, needs_work_permit'

/** The signed in user's saved details, or null when they have not opted in. */
export async function getProfileBasics(): Promise<ProfileBasicsRecord | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('user_profile_basics')
    .select(COLUMNS)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as ProfileBasicsRecord | null) ?? null
}

/**
 * Saves the details and the consent version they were given under. Written as
 * an upsert on the primary key, so the first save and every later edit are the
 * same call. consent_at, created_at and updated_at are the database's to set.
 */
export async function saveProfileBasics(form: ProfileBasicsForm): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { error } = await supabase
    .from('user_profile_basics')
    .upsert(
      {
        user_id: user.id,
        consent_version: PROFILE_BASICS_CONSENT_VERSION,
        ...buildProfileBasicsPayload(form),
      },
      { onConflict: 'user_id' },
    )

  if (error) throw new Error(error.message)
}

/** Withdrawal: the row goes, consent record and all. */
export async function deleteProfileBasics(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { error } = await supabase.from('user_profile_basics').delete().eq('user_id', user.id)
  if (error) throw new Error(error.message)
}
