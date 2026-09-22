'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/server/auth'
import { serviceClient } from '@/server/supabase'
import { recordAdminAction } from '@/server/audit'
import { resolveGrantAmount } from '@/lib/creditGrant'

export interface GrantState {
  error: string | null
  ok: boolean
  granted: number | null
}

export async function grantFreeCredits(
  _previous: GrantState,
  formData: FormData,
): Promise<GrantState> {
  // Authorisation is re-checked inside the action, matching createSupportNote:
  // a Server Action is a public HTTP endpoint regardless of what page calls it.
  const { admin } = await requireAdmin()

  const userId = String(formData.get('userId') ?? '')
  const rawPlan = String(formData.get('plan') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()

  if (!userId) return { error: 'Missing user.', ok: false, granted: null }
  if (!reason) return { error: 'A reason is required for a manual grant.', ok: false, granted: null }
  if (reason.length > 500) {
    return { error: 'Reason is limited to 500 characters.', ok: false, granted: null }
  }

  const amount = resolveGrantAmount(rawPlan)
  if (amount === null) return { error: 'Unrecognised grant plan.', ok: false, granted: null }

  const outcome = await recordAdminAction(
    admin,
    {
      action: 'credits.manual_grant',
      targetType: 'user',
      targetId: userId,
      reason,
      after: { plan: rawPlan, amount },
    },
    async () => {
      // grant_check_credits is security definer, restricted to service_role,
      // and is the only path onto credit_batches / check_ledger / the balance:
      // there are no insert or update RLS policies on those tables.
      const { error } = await serviceClient().rpc('grant_check_credits', {
        p_user_id: userId,
        p_amount: amount,
        p_source: 'manual_grant',
      })
      if (error) throw new Error(error.message)
      return { granted: amount }
    },
  )

  if (!outcome.ok) {
    return { error: outcome.error ?? 'Could not grant credits.', ok: false, granted: null }
  }

  revalidatePath(`/users/${userId}`)
  return { error: null, ok: true, granted: amount }
}
