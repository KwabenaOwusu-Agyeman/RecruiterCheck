import { supabase } from '@/lib/supabase'
import {
  RESEARCH_CONSENT_VERSION,
  toResearchConsentState,
  type ResearchConsentRow,
  type ResearchConsentState,
} from '@/lib/researchConsent'

/** The signed in user's research consent, off when they have never given it. */
export async function getResearchConsent(): Promise<ResearchConsentState> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { granted: false, withdrawn: false, grantedAt: null }

  const { data, error } = await supabase
    .from('research_consents')
    .select('consent_version, granted_at, withdrawn_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return toResearchConsentState((data as ResearchConsentRow | null) ?? null)
}

/**
 * Grants consent, or grants it again after a withdrawal. The upsert clears
 * withdrawn_at and records the version of the wording just agreed to;
 * granted_at is the database's to set on first insert, and is deliberately
 * left alone on a re-grant so the original date is not lost.
 */
export async function grantResearchConsent(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { error: updateError, count } = await supabase
    .from('research_consents')
    .update({ consent_version: RESEARCH_CONSENT_VERSION, withdrawn_at: null }, { count: 'exact' })
    .eq('user_id', user.id)

  if (updateError) throw new Error(updateError.message)
  if (count && count > 0) return

  const { error } = await supabase
    .from('research_consents')
    .insert({ user_id: user.id, consent_version: RESEARCH_CONSENT_VERSION })

  if (error && error.code !== '23505') throw new Error(error.message)
}

/** Withdrawal. The row stays, so the record of what was consented to stays. */
export async function withdrawResearchConsent(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { error } = await supabase
    .from('research_consents')
    .update({ withdrawn_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('withdrawn_at', null)

  if (error) throw new Error(error.message)
}
