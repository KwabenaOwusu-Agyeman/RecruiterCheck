// Pure, network-free logic for the "Your Recruiter Check is ready" email
// (split out so it can be unit tested via `npx tsx` without the Deno
// runtime, matching the pattern used by logic.ts in this same function).

export interface ResultsEmailParams {
  toEmail: string
  recipientName: string | null
  jobTitle: string | null
  companyName: string | null
  score: number
  resultsUrl: string
}

export interface BrevoSendPayload {
  sender: { email: string; name: string }
  to: Array<{ email: string }>
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
  companyName: string | null
  score: number
  resultsUrl: string
}): string {
  const navy = '#020C38'
  const blue = '#194A9F'
  const textSecondary = '#3A4A6B'
  const border = '#EEF0F5'

  const greeting = params.recipientName ? `Hi ${escapeHtml(params.recipientName)},` : 'Hi,'
  const roleLine =
    params.jobTitle && params.companyName
      ? `for ${escapeHtml(params.jobTitle)} at ${escapeHtml(params.companyName)} `
      : params.jobTitle
        ? `for ${escapeHtml(params.jobTitle)} `
        : ''

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <title>Your Recruiter Check is ready</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff;">
          <tr>
            <td align="center" style="padding: 40px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px;">

                <tr>
                  <td style="padding-bottom: 32px;">
                    <span style="font-size: 16px; font-weight: 700; color: ${navy};">MyRecruiterCheck</span>
                  </td>
                </tr>

                <tr>
                  <td>
                    <h1 style="margin: 0 0 12px; font-size: 24px; line-height: 30px; font-weight: 700; color: ${navy};">
                      Your Recruiter Check is ready
                    </h1>
                    <p style="margin: 0 0 8px; font-size: 16px; line-height: 24px; color: ${textSecondary};">
                      ${greeting}
                    </p>
                    <p style="margin: 0 0 28px; font-size: 16px; line-height: 24px; color: ${textSecondary};">
                      Your Recruiter Check ${roleLine}is complete. Your Interview Probability score is <strong style="color: ${navy};">${params.score}%</strong>.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding-bottom: 40px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="border-radius: 8px; background-color: ${blue};">
                          <a href="${params.resultsUrl}" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none;">
                            View my results
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding-top: 24px; border-top: 1px solid ${border};">
                    <p style="margin: 24px 0 0; font-size: 12px; line-height: 18px; color: ${textSecondary};">
                      MyRecruiterCheck, think like a recruiter before you apply.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `
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
): BrevoSendPayload {
  const payload: BrevoSendPayload = {
    sender: { email: senderEmail, name: senderName },
    to: [{ email: params.toEmail }],
    subject: 'Your Recruiter Check is ready',
    htmlContent: buildResultsEmailHtml({
      recipientName: params.recipientName,
      jobTitle: params.jobTitle,
      companyName: params.companyName,
      score: params.score,
      resultsUrl: params.resultsUrl,
    }),
  }

  if (bccEmail && bccEmail.trim()) {
    payload.bcc = [{ email: bccEmail.trim() }]
  }

  return payload
}
