import { useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Container } from '@/components/ui/Container'
import { usePageMeta } from '@/hooks/usePageMeta'
import {
  CHANNEL_OPTIONS,
  COUNTRY_OPTIONS,
  CURRENCY_OPTIONS,
  EMPTY_OUTCOME_FORM,
  STAGE_OPTIONS,
  buildOutcomePayload,
  canSubmitOutcome,
  type OutcomeFormState,
} from '@/lib/outcomeForm'
import { lookupOutcomeLink, submitOutcome, withdrawOutcome } from '@/services/outcomeService'

type Status = 'checking' | 'invalid' | 'form' | 'saving' | 'saved' | 'withdrawn'

const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const fieldClass =
  'mt-1 w-full rounded-[10px] border border-border-soft bg-background px-3 py-2 text-sm text-text-primary outline-none focus:border-blue'

/**
 * Public page behind the application outcome follow up email. The token in
 * the link is the only credential; see submit-application-outcome.
 */
export function OutcomePage() {
  usePageMeta({
    title: 'How did your application go? | MyRecruiterCheck',
    description: 'Tell us how your application went.',
    path: '/outcome',
    noindex: true,
  })

  const [params] = useSearchParams()
  const token = (params.get('token') ?? '').trim()
  const [status, setStatus] = useState<Status>('checking')
  const [answeredBefore, setAnsweredBefore] = useState(false)
  const [form, setForm] = useState<OutcomeFormState>(EMPTY_OUTCOME_FORM)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!TOKEN_PATTERN.test(token)) {
      setStatus('invalid')
      return
    }
    let active = true
    lookupOutcomeLink(token)
      .then((result) => {
        if (!active) return
        setAnsweredBefore(result.answered)
        setStatus(result.withdrawn ? 'withdrawn' : 'form')
      })
      .catch(() => active && setStatus('invalid'))
    return () => {
      active = false
    }
  }, [token])

  const update = (patch: Partial<OutcomeFormState>) => setForm((current) => ({ ...current, ...patch }))

  async function handleSubmit() {
    setError(null)
    setStatus('saving')
    try {
      await submitOutcome(token, buildOutcomePayload(form))
      setStatus('saved')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We could not save your answer. Try again.')
      setStatus('form')
    }
  }

  async function handleWithdraw() {
    setError(null)
    try {
      await withdrawOutcome(token)
      setStatus('withdrawn')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We could not update your preference. Try again.')
    }
  }

  const saving = status === 'saving'

  return (
    <main className="flex min-h-screen items-center bg-background py-16">
      <Container>
        <Card className="mx-auto max-w-lg">
          <CardContent className="p-8">
            <h1 className="text-3xl font-semibold text-text-primary">How did your application go?</h1>

            {status === 'checking' ? <p className="mt-5 text-text-secondary">Opening your link…</p> : null}

            {status === 'invalid' ? (
              <p className="mt-5 text-text-secondary">
                This link is not valid. Use the button in the email we sent you.
              </p>
            ) : null}

            {status === 'saved' ? (
              <p className="mt-5 text-text-secondary">
                Thank you. Your answer helps make the score more accurate for everyone.
              </p>
            ) : null}

            {status === 'withdrawn' ? (
              <p className="mt-5 text-text-secondary">
                Done. We will not ask you about this application again.
              </p>
            ) : null}

            {status === 'form' || status === 'saving' ? (
              <form
                className="mt-5 flex flex-col gap-5"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (canSubmitOutcome(form)) void handleSubmit()
                }}
              >
                {answeredBefore ? (
                  <Alert variant="info">You already answered. Sending again replaces your earlier answer.</Alert>
                ) : null}

                <Choice legend="Did you apply?">
                  {(['yes', 'no'] as const).map((value) => (
                    <Radio
                      key={value}
                      name="applied"
                      label={value === 'yes' ? 'Yes' : 'No'}
                      checked={form.applied === value}
                      disabled={saving}
                      onChange={() => update({ applied: value })}
                    />
                  ))}
                </Choice>

                {form.applied === 'yes' ? (
                  <>
                    <Choice legend="How did you apply?">
                      {CHANNEL_OPTIONS.map((option) => (
                        <Radio
                          key={option.value}
                          name="channel"
                          label={option.label}
                          checked={form.channel === option.value}
                          disabled={saving}
                          onChange={() => update({ channel: option.value })}
                        />
                      ))}
                    </Choice>

                    <Choice legend="How far did it get?">
                      {STAGE_OPTIONS.map((option) => (
                        <Radio
                          key={option.value}
                          name="stage"
                          label={option.label}
                          checked={form.stage === option.value}
                          disabled={saving}
                          onChange={() => update({ stage: option.value })}
                        />
                      ))}
                    </Choice>

                    {form.stage && form.stage !== 'no_reply' ? (
                      <label className="text-sm font-medium text-text-primary">
                        How many days until they replied? (optional)
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={365}
                          value={form.daysToReply}
                          disabled={saving}
                          onChange={(event) => update({ daysToReply: event.target.value })}
                          className={fieldClass}
                        />
                      </label>
                    ) : null}

                    {form.stage === 'offer' ? (
                      <fieldset className="flex flex-col gap-3">
                        <legend className="text-sm font-medium text-text-primary">
                          Salary offered, per year (optional)
                        </legend>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="For example 55000"
                          aria-label="Salary offered per year"
                          value={form.salary}
                          disabled={saving}
                          onChange={(event) => update({ salary: event.target.value })}
                          className={fieldClass}
                        />
                        {form.salary.trim() ? (
                          <div className="flex gap-3">
                            <select
                              aria-label="Currency"
                              value={form.currency}
                              disabled={saving}
                              onChange={(event) => update({ currency: event.target.value })}
                              className={fieldClass}
                            >
                              {CURRENCY_OPTIONS.map((code) => (
                                <option key={code} value={code}>
                                  {code}
                                </option>
                              ))}
                            </select>
                            <select
                              aria-label="Country of the job"
                              value={form.country}
                              disabled={saving}
                              onChange={(event) => update({ country: event.target.value })}
                              className={fieldClass}
                            >
                              <option value="">Country of the job</option>
                              {COUNTRY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}
                      </fieldset>
                    ) : null}
                  </>
                ) : null}

                {error ? <Alert variant="error">{error}</Alert> : null}

                <div>
                  <Button type="submit" disabled={saving || !canSubmitOutcome(form)}>
                    {saving ? 'Saving…' : 'Send'}
                  </Button>
                </div>

                <p className="text-sm text-text-secondary">
                  Rather not be asked?{' '}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleWithdraw()}
                    className="font-medium text-blue hover:underline"
                  >
                    Stop asking me
                  </button>
                </p>
              </form>
            ) : null}

            <div className="mt-6">
              <Link to="/" className="text-sm font-medium text-blue hover:underline">
                Return to MyRecruiterCheck
              </Link>
            </div>
          </CardContent>
        </Card>
      </Container>
    </main>
  )
}

function Choice({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-text-primary">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </fieldset>
  )
}

function Radio({
  name,
  label,
  checked,
  disabled,
  onChange,
}: {
  name: string
  label: string
  checked: boolean
  disabled: boolean
  onChange: () => void
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
        checked ? 'border-blue bg-blue/5 text-text-primary' : 'border-border-soft text-text-secondary'
      }`}
    >
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} className="sr-only" />
      {label}
    </label>
  )
}
