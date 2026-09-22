// Anonymised research consent: the wording, and the small amount of logic the
// Account card needs.
//
// Build item 3 of the Decision Log entry "Data strategy: what we collect, for
// product value and exit readiness" (approved 2026-09-16).
//
// The wording is the boundary of what may be done with the data, so it is
// specific about three things: the data is anonymised, it is used to improve
// the product and to build job market insight, and it is NOT used to train
// models. Widening any of those needs a new decision and a new version here.

/** Bump whenever RESEARCH_CONSENT_TEXT changes. Stored on every row. */
export const RESEARCH_CONSENT_VERSION = '2026-09-22'

export const RESEARCH_CONSENT_TEXT =
  'Use my checks, with my name, email and employer removed, to improve MyRecruiterCheck and to build anonymous job market insights that may be published. My CV is not kept and nothing here is used to train AI models. I can withdraw at any time.'

/** The three points the card lists under the checkbox. Copy rule: stop at three. */
export const RESEARCH_CONSENT_POINTS = [
  'Your name, email and the employer you applied to are never part of it.',
  'Your CV is deleted within 24 hours either way, and is never part of it.',
  'Withdrawing takes effect at once, and removes your checks from future work.',
] as const

export interface ResearchConsentState {
  /** A consent row exists and has not been withdrawn. */
  granted: boolean
  /** The user granted consent before and then withdrew it. */
  withdrawn: boolean
  grantedAt: string | null
}

export interface ResearchConsentRow {
  consent_version: string
  granted_at: string
  withdrawn_at: string | null
}

export function toResearchConsentState(row: ResearchConsentRow | null): ResearchConsentState {
  if (!row) return { granted: false, withdrawn: false, grantedAt: null }
  return {
    granted: row.withdrawn_at === null,
    withdrawn: row.withdrawn_at !== null,
    grantedAt: row.withdrawn_at === null ? row.granted_at : null,
  }
}

/** What the card says about the current state, in one line. */
export function describeResearchConsent(state: ResearchConsentState): string {
  if (state.granted) return 'On, thank you'
  if (state.withdrawn) return 'Withdrawn'
  return 'Off'
}
