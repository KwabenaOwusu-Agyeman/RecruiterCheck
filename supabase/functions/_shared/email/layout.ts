// Shared HTML shell for every MyRecruiterCheck transactional email:
// hidden preview text, navy header, white content card, one primary
// button, and a minimal footer. Every template in templates.ts (and the
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

  const ctaBlock = cta
    ? `
                <tr>
                  <td style="padding: 0 0 ${spacing.lg};">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="border-radius: ${radius.button}; background-color: ${color.buttonBackground};">
                          <a href="${escapeAttribute(cta.url)}" style="display: inline-block; padding: 16px 32px; font-size: 16px; font-weight: 600; color: ${color.buttonText}; text-decoration: none; border-radius: ${radius.button}; font-family: ${font.stack};">
                            ${escapeHtml(cta.label)}
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 0 ${spacing.md};">
                    <p style="margin: 0; font-size: 13px; line-height: 20px; color: ${color.textSecondary}; word-break: break-all;">
                      Or paste this link into your browser:<br />
                      <a href="${escapeAttribute(cta.url)}" style="color: ${color.blue};">${escapeHtml(cta.url)}</a>
                    </p>
                  </td>
                </tr>`
    : ''

  const supportingBlock = supportingHtml
    ? `
                <tr>
                  <td style="padding: 0 0 ${spacing.md};">
                    <p style="margin: 0; font-size: 14px; line-height: 21px; color: ${color.textSecondary};">
                      ${supportingHtml}
                    </p>
                  </td>
                </tr>`
    : ''

  const supportBlock = supportEmail
    ? `<p style="margin: 8px 0 0; font-size: 12px; line-height: 18px; color: ${color.textSecondary};">
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

            <!-- Navy header -->
            <tr>
              <td style="background-color: ${color.navy}; border-radius: ${radius.card} ${radius.card} 0 0; padding: ${spacing.md} ${spacing.md};">
                <span style="font-size: 18px; font-weight: 700; color: ${color.white}; font-family: ${font.stack};">
                  MyRecruiterCheck
                </span>
              </td>
            </tr>

            <!-- White content card -->
            <tr>
              <td style="background-color: ${color.surface}; border: 1px solid ${color.border}; border-top: none; border-radius: 0 0 ${radius.card} ${radius.card}; padding: ${spacing.lg} ${spacing.md};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding: 0 0 ${spacing.sm};">
                      <h1 style="margin: 0; font-size: 22px; line-height: 28px; font-weight: 700; color: ${color.navy}; font-family: ${font.stack};">
                        ${escapeHtml(heading)}
                      </h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 0 0 ${spacing.md};">
                      <p style="margin: 0; font-size: 16px; line-height: 24px; color: ${color.textSecondary}; font-family: ${font.stack};">
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
              <td style="padding: ${spacing.md} ${spacing.sm} 0;">
                <p style="margin: 0; font-size: 12px; line-height: 18px; color: ${color.textSecondary}; text-align: center; font-family: ${font.stack};">
                  MyRecruiterCheck. Think like a recruiter before you apply.<br />
                  <a href="https://myrecruitercheck.com" style="color: ${color.textSecondary};">myrecruitercheck.com</a>
                </p>
                ${supportBlock ? `<p style="margin: 4px 0 0; text-align: center;">${supportBlock}</p>` : ''}
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
