// Renders one weekly newsletter issue to email-safe HTML for Brevo.
//
// Brevo owns sending. This owns the LOOK, so every issue renders identically
// and nobody rebuilds the layout by hand each week in a drag and drop editor.
// The weekly job is writing the words; the HTML is not part of the weekly job.
//
// Colours, fonts and radii come from EMAIL_TOKENS, the same tokens every
// transactional email uses, so the newsletter cannot drift into a second look.
// A brand colour change happens in one file and this follows.
//
// Table based layout with inlined styles throughout, matching layout.ts, since
// Gmail and Outlook do not reliably support anything else.
//
// The validator below enforces the copy conventions in CLAUDE.md rather than
// trusting anyone to remember them at 8am on a Monday. An issue that breaks
// them does not render.

import { EMAIL_TOKENS } from '../../supabase/functions/_shared/email/tokens.ts'

const { color, font, radius, spacing, maxWidth } = EMAIL_TOKENS

export interface IssueArticle {
  /** Short category label shown above the headline, e.g. "Hiring trends". */
  category: string
  /** Estimated read time in minutes. Rendered as "4 min read". */
  readMinutes: number
  headline: string
  /** Two or three sentences of excerpt, as in the reference format. */
  body: string
  /**
   * Hero image at the top of the card. Must be an absolute https URL that
   * survives being loaded from an inbox: Brevo's own image library or
   * myrecruitercheck.com, never a local path.
   */
  image?: { url: string; alt: string }
  /**
   * Where "Read the article" points. There is no blog, but there are 23 SEO
   * pages that are already articles, so those are the destinations.
   */
  link?: { label: string; url: string }
}

export interface Issue {
  /** Sequential issue number, shown in the header beside the month. */
  week: number
  /** e.g. "September 2026". */
  period: string
  /**
   * Greeting above the intro. Brevo merge tags are allowed here and are the
   * reason this is a separate field: "Hi {{ contact.FIRSTNAME }}," renders
   * per recipient, and merge syntax is deliberately not escaped.
   */
  greeting: string
  /** One sentence under the greeting saying what this issue is. */
  intro: string
  articles: IssueArticle[]
  /** The single product action. Always present: the point is checks. */
  cta: { heading: string; body: string; label: string; url: string }
  /** Signed name and role at the foot of the letter. */
  signOff: { name: string; role: string }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// --- validation --------------------------------------------------------------

/**
 * Every dash a reader could see. CLAUDE.md bans them outright in user facing
 * copy, ranges included, and a newsletter is about as user facing as it gets.
 * The BIZZY issue this format is modelled on uses em dashes throughout, so
 * copying its rhythm without this check would import the habit.
 */
const DASHES = /[-‐‑‒–—―]/

/** Fields a reader sees, and therefore fields the copy rules apply to. */
function readerFacingFields(issue: Issue): { path: string; value: string }[] {
  const fields = [
    { path: 'period', value: issue.period },
    // Merge tags are stripped before checking: "{{ contact.FIRSTNAME }}"
    // carries no reader facing dash, and the braces are Brevo's, not copy.
    { path: 'greeting', value: issue.greeting.replace(/\{\{[^}]*\}\}/g, '') },
    { path: 'intro', value: issue.intro },
    { path: 'cta.heading', value: issue.cta.heading },
    { path: 'cta.body', value: issue.cta.body },
    { path: 'cta.label', value: issue.cta.label },
    { path: 'signOff.name', value: issue.signOff.name },
    { path: 'signOff.role', value: issue.signOff.role },
  ]
  issue.articles.forEach((article, i) => {
    fields.push(
      { path: `articles[${i}].category`, value: article.category },
      { path: `articles[${i}].headline`, value: article.headline },
      { path: `articles[${i}].body`, value: article.body },
    )
    if (article.link) fields.push({ path: `articles[${i}].link.label`, value: article.link.label })
  })
  return fields
}

/**
 * Returns every reason the issue cannot be sent. Empty means it renders.
 * Collects all problems rather than throwing on the first, so a writer fixes
 * one round of notes instead of discovering them one at a time.
 */
export function validateIssue(issue: Issue): string[] {
  const problems: string[] = []

  if (issue.articles.length === 0) {
    problems.push('An issue needs at least one article.')
  }
  // The three item cap in CLAUDE.md governs bullet lists in PRODUCT copy, not
  // an editorial digest, and applying it here was me reading it too broadly.
  // Six is the practical ceiling: past that a weekly stops being read and
  // starts being scrolled.
  if (issue.articles.length > 6) {
    problems.push(
      `An issue carries at most 6 articles, found ${issue.articles.length}.`,
    )
  }

  for (const { path, value } of readerFacingFields(issue)) {
    if (!value || !value.trim()) {
      problems.push(`${path} is empty.`)
      continue
    }
    if (DASHES.test(value)) {
      problems.push(
        `${path} contains a dash. Copy conventions forbid dashes in user facing copy, ranges spelled out instead: "${value}"`,
      )
    }
  }

  for (const [i, article] of issue.articles.entries()) {
    if (!Number.isFinite(article.readMinutes) || article.readMinutes <= 0) {
      problems.push(`articles[${i}].readMinutes must be a positive number.`)
    }
    if (article.link && !/^https:\/\//.test(article.link.url)) {
      problems.push(`articles[${i}].link.url must be an https URL.`)
    }
    if (article.image && !/^https:\/\//.test(article.image.url)) {
      problems.push(
        `articles[${i}].image.url must be an absolute https URL. An inbox cannot load a local path.`,
      )
    }
    if (article.image && !article.image.alt.trim()) {
      problems.push(`articles[${i}].image.alt is empty. Images are blocked by default in most clients.`)
    }
  }

  if (!/^https:\/\//.test(issue.cta.url)) {
    problems.push('cta.url must be an https URL.')
  }

  return problems
}

// --- rendering ---------------------------------------------------------------

function articleCard(article: IssueArticle): string {
  const linkRow = article.link
    ? `
              <tr>
                <td style="padding: ${spacing.sm} 0 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="border-radius: ${radius.button}; background-color: ${color.buttonBackground};">
                        <a href="${escapeHtml(article.link.url)}" style="display: inline-block; padding: 12px 28px; font-size: 15px; font-weight: 600; line-height: 20px; color: ${color.buttonText}; text-decoration: none; border-radius: ${radius.button}; font-family: ${font.stack};">${escapeHtml(article.link.label)}</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>`
    : ''

  // Rendered above the text, full bleed to the card edges, as in the reference.
  // Height is not set: a fixed height distorts on a phone, and clients that
  // block images fall back to the alt text.
  const imageRow = article.image
    ? `
              <tr>
                <td style="padding: 0;">
                  <img src="${escapeHtml(article.image.url)}" alt="${escapeHtml(article.image.alt)}" width="100%" style="display: block; width: 100%; max-width: 100%; border: 0; border-radius: ${radius.card} ${radius.card} 0 0;" />
                </td>
              </tr>`
    : ''

  return `
        <tr>
          <td style="padding: 0 0 ${spacing.md};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${color.surface}; border: 1px solid ${color.border}; border-radius: ${radius.card};">${imageRow}
              <tr>
                <td style="padding: ${spacing.md};">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="padding: 0 0 ${spacing.xs};">
                        <span style="font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${color.blue}; font-family: ${font.stack};">${escapeHtml(article.category)} &middot; ${article.readMinutes} min read</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 0 0 ${spacing.xs};">
                        <h2 style="margin: 0; font-size: 20px; line-height: 28px; font-weight: 600; color: ${color.navy}; font-family: ${font.stack};">${escapeHtml(article.headline)}</h2>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <p style="margin: 0; font-size: 15px; line-height: 24px; color: ${color.textSecondary}; font-family: ${font.stack};">${escapeHtml(article.body)}</p>
                      </td>
                    </tr>${linkRow}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
}

/**
 * Renders the issue. Throws if it breaks the copy conventions, so a bad issue
 * fails at build time rather than in somebody's inbox.
 *
 * `{{ unsubscribe }}` is left as a Brevo merge tag: Brevo owns the sending list
 * and its own unsubscribe handling, and a hardcoded link here would bypass it.
 */
export function renderIssue(issue: Issue): string {
  const problems = validateIssue(issue)
  if (problems.length > 0) {
    throw new Error(`Issue cannot be rendered:\n  ${problems.join('\n  ')}`)
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MyRecruiterCheck Weekly</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${color.background};">
<div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${escapeHtml(issue.intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${color.background};">
  <tr>
    <td align="center" style="padding: ${spacing.lg} ${spacing.sm};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: ${maxWidth};">

        <tr>
          <td style="padding: 0 0 ${spacing.md};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${color.navy}; border-radius: ${radius.card};">
              <tr>
                <td style="padding: ${spacing.md};">
                  <p style="margin: 0; font-size: 20px; font-weight: 700; line-height: 26px; color: ${color.white}; font-family: ${font.stack};">MyRecruiterCheck</p>
                  <p style="margin: 4px 0 0; font-size: 12px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: ${color.blueLight}; font-family: ${font.stack};">Week ${issue.week} &middot; ${escapeHtml(issue.period)}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding: 0 0 ${spacing.sm};">
            <p style="margin: 0; font-size: 17px; font-weight: 600; line-height: 26px; color: ${color.textPrimary}; font-family: ${font.stack};">${issue.greeting}</p>
          </td>
        </tr>

        <tr>
          <td style="padding: 0 0 ${spacing.xs};">
            <span style="font-size: 12px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: ${color.blue}; font-family: ${font.stack};">MyRecruiterCheck Weekly</span>
          </td>
        </tr>

        <tr>
          <td style="padding: 0 0 ${spacing.md};">
            <p style="margin: 0; font-size: 16px; line-height: 26px; color: ${color.textPrimary}; font-family: ${font.stack};">${escapeHtml(issue.intro)}</p>
          </td>
        </tr>
${issue.articles.map(articleCard).join('')}

        <tr>
          <td style="padding: ${spacing.xs} 0 ${spacing.md};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${color.navy}; border-radius: ${radius.card};">
              <tr>
                <td align="center" style="padding: ${spacing.lg} ${spacing.md};">
                  <p style="margin: 0 0 ${spacing.xs}; font-size: 22px; font-weight: 600; line-height: 28px; color: ${color.white}; font-family: ${font.stack};">${escapeHtml(issue.cta.heading)}</p>
                  <p style="margin: 0 0 ${spacing.md}; font-size: 15px; line-height: 24px; color: ${color.blueLight}; font-family: ${font.stack};">${escapeHtml(issue.cta.body)}</p>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                    <tr>
                      <td align="center" style="border-radius: ${radius.button}; background-color: ${color.white};">
                        <a href="${escapeHtml(issue.cta.url)}" style="display: inline-block; padding: 16px 40px; font-size: 16px; font-weight: 600; line-height: 21px; color: ${color.navy}; text-decoration: none; border-radius: ${radius.button}; font-family: ${font.stack};">${escapeHtml(issue.cta.label)}</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding: 0 0 ${spacing.md};">
            <p style="margin: 0; font-size: 15px; line-height: 24px; color: ${color.textPrimary}; font-family: ${font.stack};">${escapeHtml(issue.signOff.name)}<br /><span style="color: ${color.textSecondary};">${escapeHtml(issue.signOff.role)}</span></p>
          </td>
        </tr>

        <tr>
          <td style="padding: ${spacing.xs} 0 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${color.navy}; border-radius: ${radius.card};">
              <tr>
                <td align="center" style="padding: ${spacing.md};">
                  <p style="margin: 0 0 ${spacing.xs}; font-size: 15px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${color.white}; font-family: ${font.stack};">MyRecruiterCheck</p>
                  <p style="margin: 0 0 ${spacing.xs}; font-size: 12px; line-height: 19px; color: ${color.blueLight}; font-family: ${font.stack};">You are receiving this because you asked for the weekly when you created your account.</p>
                  <p style="margin: 0; font-size: 12px; line-height: 19px; color: ${color.blueLight}; font-family: ${font.stack};">
                    <a href="https://myrecruitercheck.com/" style="color: ${color.blueLight}; text-decoration: underline;">myrecruitercheck.com</a>
                    &nbsp;&middot;&nbsp;
                    <a href="{{ unsubscribe }}" style="color: ${color.blueLight}; text-decoration: underline;">Unsubscribe</a>
                    &nbsp;&middot;&nbsp;
                    The Netherlands
                  </p>
                </td>
              </tr>
            </table>
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
