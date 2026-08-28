// Shared HTML shell for every MyRecruiterCheck transactional email:
// hidden preview text, centered navy wordmark, white content card, one
// large primary button, and a minimal footer. Layout follows the
// monday.com transactional pattern (single centered column, oversized
// heading, one unmissable action) in MyRecruiterCheck colors.
// Every template in templates.ts (and the
// static Supabase Auth templates in supabase/templates/*.html, which
// mirror this same structure by hand since they run outside this Deno
// module) builds on this one shell so new emails never duplicate the
// whole HTML document — only the heading/body/button/supporting text
// change per email.
//
// Table-based layout + inlined styles throughout for Outlook/Gmail
// compatibility, per the email-safe HTML requirement.

import { EMAIL_TOKENS } from './tokens.ts'

const { color, font, radius, spacing, maxWidth } = EMAIL_TOKENS

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface EmailShellParams {
  /** Used as the <title> and, combined with previewText, the inbox preview line. */
  documentTitle: string
  /** Hidden preheader text shown next to the subject line in the inbox list. */
  previewText: string
  heading: string
  /** Pre-escaped/pre-formatted HTML paragraphs — callers must escapeHtml() any user-controlled content before passing it in. */
  bodyHtml: string
  /** Primary call-to-action. Omit for emails with no safe recovery action (e.g. password-changed notice with no real button). */
  cta?: { label: string; url: string }
  /** Extra HTML rendered below the button and above the footer (e.g. expiry/security notes, fallback URL). */
  supportingHtml?: string
  /** Real support email address. Only rendered when provided — no invented support channel. */
  supportEmail?: string
}

export function buildEmailShell(params: EmailShellParams): string {
  const { documentTitle, previewText, heading, bodyHtml, cta, supportingHtml, supportEmail } = params

  // Centered, single-column, one large primary action — the monday.com
  // transactional layout, rendered in MyRecruiterCheck colors. The button is
  // deliberately oversized and the heading deliberately large: these emails
  // carry exactly one action, and it should be unmissable on a phone.
  const ctaBlock = cta
    ? `
                <tr>
                  <td align="center" style="padding: ${spacing.xs} 0 ${spacing.md};">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                      <tr>
                        <td align="center" style="border-radius: ${radius.button}; background-color: ${color.buttonBackground};">
                          <a href="${escapeAttribute(cta.url)}" style="display: inline-block; padding: 18px 44px; font-size: 17px; font-weight: 600; line-height: 22px; color: ${color.buttonText}; text-decoration: none; border-radius: ${radius.button}; font-family: ${font.stack};">
                            ${escapeHtml(cta.label)}
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding: 0 0 ${spacing.sm};">
                    <p style="margin: 0; font-size: 12px; line-height: 19px; color: ${color.textSecondary}; text-align: center; word-break: break-all; font-family: ${font.stack};">
                      Or paste this link into your browser:<br />
                      <a href="${escapeAttribute(cta.url)}" style="color: ${color.blue};">${escapeHtml(cta.url)}</a>
                    </p>
                  </td>
                </tr>`
    : ''

  const supportingBlock = supportingHtml
    ? `
                <tr>
                  <td align="center" style="padding: 0 0 ${spacing.sm};">
                    <p style="margin: 0; font-size: 14px; line-height: 22px; color: ${color.textSecondary}; text-align: center; font-family: ${font.stack};">
                      ${supportingHtml}
                    </p>
                  </td>
                </tr>`
    : ''

  const supportBlock = supportEmail
    ? `<p style="margin: 8px 0 0; font-size: 12px; line-height: 18px; color: ${color.textSecondary}; text-align: center; font-family: ${font.stack};">
         Need help? Contact <a href="mailto:${escapeAttribute(supportEmail)}" style="color: ${color.blue};">${escapeHtml(supportEmail)}</a>
       </p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(documentTitle)}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: ${color.background}; font-family: ${font.stack};">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; mso-hide: all;">
      ${escapeHtml(previewText)}
      <!-- Padding so Gmail/Apple Mail don't pull in trailing body text after the preheader. -->
      &#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${color.background};">
      <tr>
        <td align="center" style="padding: ${spacing.lg} ${spacing.sm};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: ${maxWidth}; width: 100%;">

            <!-- Wordmark, centered above the card -->
            <tr>
              <td align="center" style="padding: 0 0 ${spacing.md};">
                <span style="font-size: 20px; font-weight: 700; letter-spacing: -0.01em; color: ${color.navy}; font-family: ${font.stack};">
                  MyRecruiterCheck
                </span>
              </td>
            </tr>

            <!-- White content card -->
            <tr>
              <td align="center" style="background-color: ${color.surface}; border: 1px solid ${color.border}; border-radius: ${radius.card}; padding: ${spacing.xl} ${spacing.md};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" style="padding: 0 0 ${spacing.sm};">
                      <h1 style="margin: 0; font-size: 30px; line-height: 38px; font-weight: 700; letter-spacing: -0.02em; color: ${color.navy}; text-align: center; font-family: ${font.stack};">
                        ${escapeHtml(heading)}
                      </h1>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding: 0 0 ${spacing.md};">
                      <p style="margin: 0; font-size: 17px; line-height: 26px; color: ${color.textSecondary}; text-align: center; font-family: ${font.stack};">
                        ${bodyHtml}
                      </p>
                    </td>
                  </tr>
                  ${ctaBlock}
                  ${supportingBlock}
                </table>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td align="center" style="padding: ${spacing.md} ${spacing.sm} 0;">
                <p style="margin: 0; font-size: 12px; line-height: 18px; color: ${color.textSecondary}; text-align: center; font-family: ${font.stack};">
                  MyRecruiterCheck. Think like a recruiter before you apply.<br />
                  <a href="https://myrecruitercheck.com" style="color: ${color.textSecondary};">myrecruitercheck.com</a>
                </p>
                ${supportBlock}
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/** Builds the required plain-text fallback alongside the HTML body. */
export function buildPlainText(params: {
  heading: string
  bodyLines: string[]
  cta?: { label: string; url: string }
  supportingLines?: string[]
}): string {
  const lines: string[] = ['MyRecruiterCheck', '', params.heading, '', ...params.bodyLines]

  if (params.cta) {
    lines.push('', `${params.cta.label}: ${params.cta.url}`)
  }
  if (params.supportingLines?.length) {
    lines.push('', ...params.supportingLines)
  }

  lines.push('', 'Think like a recruiter before you apply.', 'https://myrecruitercheck.com')
  return lines.join('\n')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value)
}
