import { useEffect, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import {
  RESEARCH_CONSENT_POINTS,
  RESEARCH_CONSENT_TEXT,
  describeResearchConsent,
  type ResearchConsentState,
} from '@/lib/researchConsent'
import {
  getResearchConsent,
  grantResearchConsent,
  withdrawResearchConsent,
} from '@/services/researchConsentService'

type Status = 'loading' | 'idle' | 'saving' | 'error'

const OFF: ResearchConsentState = { granted: false, withdrawn: false, grantedAt: null }

/**
 * Opt in to anonymised research use, separate from every other consent in the
 * product (Decision Log: "Data strategy: what we collect", 2026-09-16).
 * Nothing about the product changes either way, which the card says plainly,
 * so nobody agrees to this believing they have to.
 */
export function ResearchConsentCard() {
  const [state, setState] = useState<ResearchConsentState>(OFF)
  const [ticked, setTicked] = useState(false)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getResearchConsent()
      .then((result) => {
        if (!active) return
        setState(result)
        setStatus('idle')
      })
      .catch(() => active && setStatus('idle'))
    return () => {
      active = false
    }
  }, [])

  async function run(action: () => Promise<void>, next: ResearchConsentState, message: string) {
    setError(null)
    setStatus('saving')
    try {
      await action()
      setState(next)
      setTicked(false)
      setStatus('idle')
    } catch {
      setError(message)
      setStatus('error')
    }
  }

  if (status === 'loading') return null
  const busy = status === 'saving'

  return (
    <Card className="mt-4 sm:mt-8">
      <CardHeader className="flex-row items-center justify-between gap-3 py-3.5 sm:py-5">
        <h2 className="text-lg font-semibold text-text-primary sm:text-xl">Help improve the product</h2>
        <span className="shrink-0 text-xs text-text-secondary">{describeResearchConsent(state)}</span>
      </CardHeader>
      <CardContent className="py-4 sm:py-6">
        <p className="text-sm text-text-secondary">
          Anonymous research helps us learn what employers actually ask for, and makes every check
          better. It is entirely optional, and your checks work exactly the same either way.
        </p>

        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-text-secondary">
          {RESEARCH_CONSENT_POINTS.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>

        {error ? (
          <Alert variant="error" className="mt-4">
            {error}
          </Alert>
        ) : null}

        {state.granted ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="text-sm text-text-secondary">
              Thank you. Your checks help this work from{' '}
              {state.grantedAt ? new Date(state.grantedAt).toLocaleDateString('en-GB') : 'today'}.
            </p>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run(withdrawResearchConsent, { granted: false, withdrawn: true, grantedAt: null }, 'We could not withdraw that. Please try again.')
              }
            >
              {busy ? 'Saving...' : 'Withdraw'}
            </Button>
          </div>
        ) : (
          <>
            <label className="mt-4 flex items-start gap-2 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={ticked}
                disabled={busy}
                onChange={(event) => setTicked(event.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border-strong text-blue focus:ring-blue"
              />
              <span>{RESEARCH_CONSENT_TEXT}</span>
            </label>
            <Button
              size="sm"
              className="mt-3"
              disabled={!ticked || busy}
              onClick={() =>
                void run(
                  grantResearchConsent,
                  { granted: true, withdrawn: false, grantedAt: new Date().toISOString() },
                  'We could not save that. Please try again.',
                )
              }
            >
              {busy ? 'Saving...' : 'Count me in'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
