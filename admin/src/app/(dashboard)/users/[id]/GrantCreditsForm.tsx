'use client'

import { useActionState, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { grantFreeCredits, type GrantState } from './actions'
import { Button } from '@/components/ui/Button'

const initialState: GrantState = { error: null, ok: false, granted: null }

const PLAN_LABELS: Record<string, string> = {
  single: '1 free check',
  power: '40 free checks (Power pack)',
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Granting...' : label}
    </Button>
  )
}

/**
 * Grants credits are a Level 3 operation (CLAUDE.md): irreversible, changes a
 * real balance, and must be deliberate. There is no confirm-step convention
 * elsewhere in this app to copy, so this introduces the simplest one: picking
 * a plan only arms the form, a second explicit click submits it, and a reason
 * is required so the audit log always says why.
 */
export function GrantCreditsForm({ userId }: { userId: string }) {
  const [state, formAction] = useActionState(grantFreeCredits, initialState)
  const [armedPlan, setArmedPlan] = useState<string | null>(null)

  // After a successful grant, collapse back to the two plan buttons rather
  // than leaving the confirm form (and its already-typed reason) on screen,
  // which would invite an accidental second submit granting credits again.
  useEffect(() => {
    if (state.ok) setArmedPlan(null)
  }, [state.ok])

  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-border-strong bg-background p-3">
      <p className="text-sm font-medium text-text-primary">Grant a free credit (manual)</p>
      <p className="text-xs text-text-caption">
        Recorded in the audit log against this admin, with the reason given below. This adds to
        the balance the same way a purchase would; it does not remove or replace anything.
      </p>

      {!armedPlan ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setArmedPlan('single')}>
            Grant 1 free check
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setArmedPlan('power')}>
            Grant free Power pack (40)
          </Button>
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-2">
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="plan" value={armedPlan} />

          <label htmlFor="grant-reason" className="text-sm font-medium text-text-primary">
            Reason for this grant
          </label>
          <textarea
            id="grant-reason"
            name="reason"
            rows={2}
            maxLength={500}
            required
            className="rounded-[16px] border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary"
            placeholder="Why this account is getting a free grant"
          />

          <div className="flex flex-wrap items-center gap-2">
            <Submit label={`Confirm: ${PLAN_LABELS[armedPlan]}`} />
            <Button type="button" variant="secondary" size="sm" onClick={() => setArmedPlan(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {state.error ? (
        <p role="alert" className="text-sm text-error">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="text-sm text-success-deep">
          Granted {state.granted} check{state.granted === 1 ? '' : 's'}.
        </p>
      ) : null}
    </div>
  )
}
