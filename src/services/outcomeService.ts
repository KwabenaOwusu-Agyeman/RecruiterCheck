import { supabase } from '@/lib/supabase'

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
