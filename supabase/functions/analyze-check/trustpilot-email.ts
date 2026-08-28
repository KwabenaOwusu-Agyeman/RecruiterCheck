// Pure, network-free logic for the "Your Recruiter Check is ready" email
// (split out so it can be unit tested via `npx tsx` without the Deno
// runtime, matching the pattern used by logic.ts in this same function).
//
// The HTML body is built from the shared email shell in
// _shared/email/layout.ts, the same one every other transactional email
// uses. This file used to hand-roll its own complete HTML document with
// its own hardcoded hex values and its own font stack, which is why this
// email drifted off-brand: no wordmark, left-aligned, small button. Any
// future visual change belongs in the shell or in tokens.ts, not here.

import { buildEmailShell } from '../_shared/email/layout.ts'

export interface ResultsEmailParams {
  toEmail: string
  recipientName: string | null
  jobTitle: string | null
  score: number
  resultsUrl: string
}

export interface BrevoSendPayload {
  sender: { email: string; name: string }
  to: Array<{ email: string }>
  /** Omitted entirely when no reply address is configured — see buildBrevoPayload. */
  replyTo?: { email: string; name: string }
  bcc?: Array<{ email: string }>
  subject: string
  htmlContent: string
}

/**
 * Test accounts are identified via a comma-separated allowlist in the
 * TEST_ACCOUNT_EMAILS secret, matched case-insensitively. Never derived from
 * a DB flag, since none exists (see scripts/reset-test-users.ts).
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

export type SendReason = 'send' | 'blocked_not_test_account_in_test_mode' | 'skipped_test_account_in_production'

export interface SendDecision {
  shouldSend: boolean
  includeBcc: boolean
  reason: SendReason
}

/**
 * Decides whether this recipient gets a real send, and whether the
 * Trustpilot BCC is included, for the current TRUSTPILOT_EMAIL_TEST_MODE
 * state:
 *
 * - Test mode ON: only the designated test account (TEST_ACCOUNT_EMAILS)
 *   receives a real email, and the Trustpilot BCC is always omitted for it
 *   (so a real send can be verified through Brevo without ever inviting
 *   Trustpilot). Every other account is blocked outright.
 * - Test mode OFF (production): unchanged from before, test accounts never
 *   receive this email at all, and every other account gets the real send
 *   with the Trustpilot BCC included.
 */
export function resolveSendDecision(testMode: boolean, isTestAccount: boolean): SendDecision {
  if (testMode) {
    return isTestAccount
      ? { shouldSend: true, includeBcc: false, reason: 'send' }
      : { shouldSend: false, includeBcc: false, reason: 'blocked_not_test_account_in_test_mode' }
  }
  return isTestAccount
    ? { shouldSend: false, includeBcc: false, reason: 'skipped_test_account_in_production' }
    : { shouldSend: true, includeBcc: true, reason: 'send' }
}

export function buildResultsEmailHtml(params: {
  recipientName: string | null
  jobTitle: string | null
  score: number
  resultsUrl: string
}): string {
  const navy = '#020C38'

  const greeting = params.recipientName ? `Hi ${escapeHtml(params.recipientName)},` : 'Hi,'
  // Role only, never the employer. Company names are not shown anywhere,
  // in-product or in email, so nothing downstream can leak which company
  // someone applied to.
  const roleLine = params.jobTitle ? `for ${escapeHtml(params.jobTitle)} ` : ''

  return buildEmailShell({
    documentTitle: 'Your Recruiter Check is ready',
    previewText: `Your Interview Probability score is ${params.score}%.`,
    heading: 'Your Recruiter Check is ready',
    bodyHtml:
      `${greeting}<br /><br />` +
      `Your Recruiter Check ${roleLine}is complete. ` +
      `Your Interview Probability score is <strong style="color: ${navy};">${params.score}%</strong>.`,
    cta: { label: 'View my results', url: params.resultsUrl },
  })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Builds the Brevo transactional-email payload. bccEmail is optional and
 * omitted entirely (no bcc key) when not provided, so a misconfigured/empty
 * TRUSTPILOT_AFS_EMAIL secret degrades to "send the results email without
 * the Trustpilot BCC" rather than failing the send outright.
 */
export function buildBrevoPayload(
  params: ResultsEmailParams,
  senderEmail: string,
  senderName: string,
  bccEmail: string | null | undefined,
  replyToEmail?: string | null,
): BrevoSendPayload {
  const payload: BrevoSendPayload = {
    sender: { email: senderEmail, name: senderName },
    to: [{ email: params.toEmail }],
    subject: 'Your Recruiter Check is ready',
    htmlContent: buildResultsEmailHtml({
      recipientName: params.recipientName,
      jobTitle: params.jobTitle,
      score: params.score,
      resultsUrl: params.resultsUrl,
    }),
  }

  // Same rule as the shared client: only set when a real address is
  // configured, since a Reply-To pointing at an unmonitored inbox is worse
  // than leaving replies to fall back to the sender.
  if (replyToEmail && replyToEmail.trim()) {
    payload.replyTo = { email: replyToEmail.trim(), name: senderName }
  }

  if (bccEmail && bccEmail.trim()) {
    payload.bcc = [{ email: bccEmail.trim() }]
  }

  return payload
}
