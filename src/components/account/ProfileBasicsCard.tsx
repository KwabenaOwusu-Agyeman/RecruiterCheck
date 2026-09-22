import { type FormEvent, useEffect, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import {
  COUNTRY_OPTIONS,
  EDUCATION_LEVEL_OPTIONS,
  EMPLOYMENT_STATUS_OPTIONS,
  EMPTY_PROFILE_BASICS_FORM,
  INDUSTRY_OPTIONS,
  MAX_TARGET_ROLE_LENGTH,
  MAX_YEARS_EXPERIENCE,
  PROFILE_BASICS_CONSENT_TEXT,
  SENIORITY_OPTIONS,
  describeProfileBasics,
  hasAnyProfileBasics,
  toProfileBasicsForm,
  type ProfileBasicsForm,
} from '@/lib/profileBasics'
import { deleteProfileBasics, getProfileBasics, saveProfileBasics } from '@/services/profileBasicsService'

type Status = 'loading' | 'idle' | 'saving' | 'saved' | 'error'

const selectClass =
  'mt-1 w-full rounded-[10px] border border-border-soft bg-background px-3 py-2 text-sm text-text-primary outline-none focus:border-blue'

/**
 * Optional profile details on the Account page, behind the user's own consent
 * (Decision Log: "Data strategy: what we collect", 2026-09-16). Nothing here
 * is required, nothing here changes a score, and Delete removes the row and
 * the consent with it.
 */
export function ProfileBasicsCard() {
  const [form, setForm] = useState<ProfileBasicsForm>(EMPTY_PROFILE_BASICS_FORM)
  const [consent, setConsent] = useState(false)
  const [savedBefore, setSavedBefore] = useState(false)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getProfileBasics()
      .then((record) => {
        if (!active) return
        if (record) {
          setForm(toProfileBasicsForm(record))
          setSavedBefore(true)
          setConsent(true)
        }
        setStatus('idle')
      })
      .catch(() => active && setStatus('idle'))
    return () => {
      active = false
    }
  }, [])

  const update = (patch: Partial<ProfileBasicsForm>) => {
    setForm((current) => ({ ...current, ...patch }))
    setStatus((current) => (current === 'saved' ? 'idle' : current))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setStatus('saving')
    try {
      await saveProfileBasics(form)
      setSavedBefore(true)
      setStatus('saved')
    } catch {
      setError('We could not save that. Please try again.')
      setStatus('error')
    }
  }

  async function handleDelete() {
    setError(null)
    setStatus('saving')
    try {
      await deleteProfileBasics()
      setForm(EMPTY_PROFILE_BASICS_FORM)
      setConsent(false)
      setSavedBefore(false)
      setStatus('idle')
    } catch {
      setError('We could not delete that. Please try again.')
      setStatus('error')
    }
  }

  if (status === 'loading') return null

  const busy = status === 'saving'
  const canSave = consent && hasAnyProfileBasics(form) && !busy

  return (
    <Card className="mt-4 sm:mt-8">
      <CardHeader className="flex-row items-center justify-between gap-3 py-3.5 sm:py-5">
        <h2 className="text-lg font-semibold text-text-primary sm:text-xl">About you</h2>
        <span className="shrink-0 text-xs text-text-secondary">
          {savedBefore ? describeProfileBasics(form) : 'Optional'}
        </span>
      </CardHeader>
      <CardContent className="py-4 sm:py-6">
        <p className="text-sm text-text-secondary">
          Tell us a little about the work you are looking for. It helps us make checks more useful,
          and none of it is required or shown to anyone.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="pb-role">Target role</Label>
            <Input
              id="pb-role"
              value={form.targetRole}
              maxLength={MAX_TARGET_ROLE_LENGTH}
              disabled={busy}
              placeholder="For example Data Analyst"
              onChange={(event) => update({ targetRole: event.target.value })}
            />
          </div>

          <Field id="pb-seniority" label="Level" value={form.seniority} options={SENIORITY_OPTIONS} disabled={busy} onChange={(v) => update({ seniority: v })} />
          <Field id="pb-country" label="Where you are looking" value={form.country} options={COUNTRY_OPTIONS} disabled={busy} onChange={(v) => update({ country: v })} />

          <div>
            <Label htmlFor="pb-years">Years of experience</Label>
            <Input
              id="pb-years"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_YEARS_EXPERIENCE}
              value={form.yearsExperience}
              disabled={busy}
              onChange={(event) => update({ yearsExperience: event.target.value })}
            />
          </div>

          <Field id="pb-industry" label="Industry" value={form.industry} options={INDUSTRY_OPTIONS} disabled={busy} onChange={(v) => update({ industry: v })} />
          <Field id="pb-employment" label="Right now you are" value={form.employmentStatus} options={EMPLOYMENT_STATUS_OPTIONS} disabled={busy} onChange={(v) => update({ employmentStatus: v })} />
          <Field id="pb-education" label="Highest education" value={form.educationLevel} options={EDUCATION_LEVEL_OPTIONS} disabled={busy} onChange={(v) => update({ educationLevel: v })} />

          <div className="sm:col-span-2">
            <Label htmlFor="pb-permit">Do you need a work permit there?</Label>
            <select
              id="pb-permit"
              className={selectClass}
              value={form.needsWorkPermit}
              disabled={busy}
              onChange={(event) => update({ needsWorkPermit: event.target.value as ProfileBasicsForm['needsWorkPermit'] })}
            >
              <option value="">Prefer not to say</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>

          <label className="flex items-start gap-2 text-xs text-text-secondary sm:col-span-2">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border-strong text-blue focus:ring-blue"
            />
            <span>{PROFILE_BASICS_CONSENT_TEXT}</span>
          </label>

          {error ? (
            <Alert variant="error" className="sm:col-span-2">
              {error}
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button type="submit" size="sm" disabled={!canSave}>
              {busy ? 'Saving...' : 'Save'}
            </Button>
            {savedBefore ? (
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void handleDelete()}>
                Delete these details
              </Button>
            ) : null}
            {status === 'saved' ? <span className="text-xs text-text-secondary">Saved.</span> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function Field({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: readonly { value: string; label: string }[]
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <select id={id} className={selectClass} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        <option value="">Prefer not to say</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
