// Pure helpers for the application outcome opt in and the /outcome form.
// The server (supabase/functions/submit-application-outcome/logic.ts)
// validates everything again; these only shape what the page sends.

/**
 * Bump the version whenever OUTCOME_CONSENT_TEXT changes, so each stored row
 * records exactly which wording the user agreed to.
 */
export const OUTCOME_CONSENT_VERSION = '2026-09-16'

export const OUTCOME_CONSENT_TEXT =
  'Email me in three weeks to ask how this application went. My answers help improve MyRecruiterCheck and may be used, anonymised, in job market insights. I can stop these emails at any time.'

export const CHANNEL_OPTIONS = [
  { value: 'job_board', label: 'Job board' },
  { value: 'referral', label: 'Referral' },
  { value: 'company_site', label: 'Company website' },
  { value: 'other', label: 'Other' },
] as const

export const STAGE_OPTIONS = [
  { value: 'no_reply', label: 'No reply yet' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'interview', label: 'Invited to interview' },
  { value: 'offer', label: 'Offer' },
] as const

export const CURRENCY_OPTIONS = ['EUR', 'GBP', 'USD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CAD', 'AUD'] as const

export const COUNTRY_OPTIONS = [
  { value: 'NL', label: 'Netherlands' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'DE', label: 'Germany' },
  { value: 'BE', label: 'Belgium' },
  { value: 'FR', label: 'France' },
  { value: 'IE', label: 'Ireland' },
  { value: 'ES', label: 'Spain' },
  { value: 'IT', label: 'Italy' },
  { value: 'SE', label: 'Sweden' },
  { value: 'CH', label: 'Switzerland' },
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
  { value: 'IN', label: 'India' },
  { value: 'NG', label: 'Nigeria' },
  { value: 'KE', label: 'Kenya' },
  { value: 'GH', label: 'Ghana' },
  { value: 'ZA', label: 'South Africa' },
  { value: 'PK', label: 'Pakistan' },
] as const

export interface OutcomeFormState {
  applied: 'yes' | 'no' | ''
  channel: string
  stage: string
  daysToReply: string
  salary: string
  currency: string
  country: string
}

export const EMPTY_OUTCOME_FORM: OutcomeFormState = {
  applied: '',
  channel: '',
  stage: '',
  daysToReply: '',
  salary: '',
  currency: 'EUR',
  country: '',
}

/** Whether the form has enough to submit. The server has the final say. */
export function canSubmitOutcome(state: OutcomeFormState): boolean {
  if (state.applied === 'no') return true
  if (state.applied !== 'yes') return false
  if (!state.channel || !state.stage) return false
  if (state.stage === 'offer' && state.salary.trim() && (!state.currency || !state.country)) return false
  return true
}

/**
 * The request body for an answer. Fields that do not apply to the chosen
 * answer are dropped, so a value typed and then hidden is never sent.
 */
export function buildOutcomePayload(state: OutcomeFormState): Record<string, unknown> {
  if (state.applied !== 'yes') return { applied: false }

  const payload: Record<string, unknown> = {
    applied: true,
    channel: state.channel,
    stage: state.stage,
  }
  if (state.stage !== 'no_reply' && state.daysToReply.trim()) payload.days_to_reply = state.daysToReply.trim()
  if (state.stage === 'offer' && state.salary.trim()) {
    payload.salary_offered = state.salary.trim()
    payload.salary_currency = state.currency
    payload.salary_country = state.country
  }
  return payload
}
