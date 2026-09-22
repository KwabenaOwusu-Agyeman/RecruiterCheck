import { supabase } from '@/lib/supabase'
import { OUTCOME_CONSENT_VERSION } from '@/lib/outcomeForm'

export interface OutcomeOptIn {
  optedIn: boolean
  withdrawn: boolean
}

/** Whether the signed in user has opted in to the follow up for this check. */
export async function getOutcomeOptIn(checkId: string): Promise<OutcomeOptIn> {
  const { data, error } = await supabase
    .from('application_outcomes')
    .select('id, withdrawn_at')
    .eq('check_id', checkId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return { optedIn: data !== null, withdrawn: Boolean(data?.withdrawn_at) }
}

/**
 * Records the opt in. Only check_id, user_id and consent_version are
 * writable by the client (column grants in the migration); the database sets
 * the consent time, the link token and the due date itself. A second opt in
 * for the same check hits the unique constraint and is treated as success.
 */
export async function optInToOutcomeFollowup(checkId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { error } = await supabase
    .from('application_outcomes')
    .insert({ check_id: checkId, user_id: user.id, consent_version: OUTCOME_CONSENT_VERSION })

  if (error && error.code !== '23505') throw new Error(error.message)
}

async function callOutcomeFunction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('submit-application-outcome', { body })
  if (data?.error) throw new Error(String(data.error))
  if (error) {
    // A 4xx from the function still carries a readable message in its body.
    const context = (error as { context?: Response }).context
    if (context && typeof context.json === 'function') {
      const parsed = await context.json().catch(() => null)
      if (parsed?.error) throw new Error(String(parsed.error))
    }
    throw new Error('We could not reach MyRecruiterCheck. Try again.')
  }
  return (data ?? {}) as Record<string, unknown>
}

export async function lookupOutcomeLink(token: string): Promise<{ withdrawn: boolean; answered: boolean }> {
  const data = await callOutcomeFunction({ token, action: 'lookup' })
  return { withdrawn: Boolean(data.withdrawn), answered: Boolean(data.answered) }
}

export async function submitOutcome(token: string, answer: Record<string, unknown>): Promise<void> {
  await callOutcomeFunction({ ...answer, token, action: 'answer' })
}

export async function withdrawOutcome(token: string): Promise<void> {
  await callOutcomeFunction({ token, action: 'withdraw' })
}
