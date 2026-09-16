// Pure, network free logic for the application outcome follow up email.
// Split out so it can be unit tested with `npx tsx` without the Deno runtime,
// matching logic.ts in analyze-check and publish-weekly-newsletter.

import { buildEmailShell, buildPlainText, escapeHtml } from '../_shared/email/layout.ts'

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

/** Rows claimed per run. The claim RPC clamps this too. */
export const BATCH_SIZE = 100

/**
 * Comma separated allowlist in TEST_ACCOUNT_EMAILS, matched case
 * insensitively. Same rule as analyze-check/trustpilot-email.ts, repeated here
 * rather than imported across function directories, because the deploy
 * workflow ships each function directory on its own.
 */
export function isTestAccountEmail(email: string, testAccountEmailsEnv: string | null | undefined): boolean {
  if (!testAccountEmailsEnv) return false
  const normalized = email.trim().toLowerCase()
  return testAccountEmailsEnv
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalized)
}

/**
 * Test mode fails closed: anything other than an explicit 'false' keeps it on,
 * so an unset secret can never email real users.
 */
export function isTestMode(value: string | null | undefined): boolean {
  return (value ?? '').trim().toLowerCase() !== 'false'
}

export type FollowupDecision = 'send' | 'hold_test_mode'

/**
 * In test mode only test accounts are emailed; everyone else is held (the row
 * is released, not consumed, so they are emailed once test mode is off).
 * Outside test mode everyone who opted in is emailed, test accounts included,
 * because they opted in like anyone else.
 */
export function decideFollowup(testMode: boolean, isTestAccount: boolean): FollowupDecision {
  if (testMode && !isTestAccount) return 'hold_test_mode'
  return 'send'
}

export function buildOutcomeUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/outcome?token=${encodeURIComponent(token)}`
}

export function buildOutcomeFollowupEmail(params: {
  jobTitle: string | null
  outcomeUrl: string
}): RenderedEmail {
  const role = params.jobTitle?.trim() || null
  const heading = 'How did your application go?'
  const lead = role
    ? `Three weeks ago you checked your application for ${role}. You asked us to follow up.`
    : 'Three weeks ago you checked an application with us. You asked us to follow up.'
  const ask = 'It takes under a minute, and your answer helps us make the score more accurate for everyone.'
  const stop = 'Rather not be asked? Open the link and choose stop asking me. We will not email you about this again.'

  return {
    subject: role ? `How did your ${role} application go?` : 'How did your application go?',
    html: buildEmailShell({
      documentTitle: heading,
      previewText: 'One quick question about your application.',
      heading,
      bodyHtml: `${escapeHtml(lead)} ${escapeHtml(ask)}`,
      cta: { label: 'Tell us how it went', url: params.outcomeUrl },
      supportingHtml: escapeHtml(stop),
    }),
    text: buildPlainText({
      heading,
      bodyLines: [lead, ask],
      cta: { label: 'Tell us how it went', url: params.outcomeUrl },
      supportingLines: [stop],
    }),
  }
}
