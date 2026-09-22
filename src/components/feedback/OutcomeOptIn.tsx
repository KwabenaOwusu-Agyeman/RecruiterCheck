import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { OUTCOME_CONSENT_TEXT } from '@/lib/outcomeForm'
import { getOutcomeOptIn, optInToOutcomeFollowup } from '@/services/outcomeService'

type State = 'loading' | 'idle' | 'saving' | 'opted_in' | 'withdrawn' | 'error'

/**
 * Opt in to the application outcome follow up (Decision Log: "Data strategy:
 * what we collect", 16 September 2026). Ticking the box is the consent, so it
 * saves immediately and cannot be unticked here: stopping is done from the
 * link in the email, which is the only way the row can be changed.
 */
export function OutcomeOptIn({ checkId }: { checkId: string }) {
  const [state, setState] = useState<State>('loading')

  useEffect(() => {
    let active = true
    getOutcomeOptIn(checkId)
      .then((result) => {
        if (!active) return
        setState(result.withdrawn ? 'withdrawn' : result.optedIn ? 'opted_in' : 'idle')
      })
      .catch(() => active && setState('idle'))
    return () => {
      active = false
    }
  }, [checkId])

  async function handleOptIn() {
    setState('saving')
    try {
      await optInToOutcomeFollowup(checkId)
      setState('opted_in')
    } catch {
      setState('error')
    }
  }

  // A user who asked us to stop is not asked again on this check.
  if (state === 'loading' || state === 'withdrawn') return null

  return (
    <Card>
      <CardContent className="px-5 py-4">
        <p className="text-sm font-semibold text-text-primary">Help us make the score more accurate</p>
        {state === 'opted_in' ? (
          <p className="mt-1 text-sm text-text-secondary">
            Thanks. We will email you in three weeks. You can stop at any time from that email.
          </p>
        ) : (
          <>
            <label className="mt-2 flex items-start gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={false}
                disabled={state === 'saving'}
                onChange={(event) => {
                  if (event.target.checked) void handleOptIn()
                }}
                className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-border-strong text-blue focus:ring-blue"
              />
              <span>{OUTCOME_CONSENT_TEXT}</span>
            </label>
            {state === 'error' ? (
              <p className="mt-2 text-xs text-error">We could not save that. Please try again.</p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
