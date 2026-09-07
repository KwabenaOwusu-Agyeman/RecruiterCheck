// Renders one weekly newsletter issue to email-safe HTML for Brevo.
//
// Brevo owns sending. This owns the LOOK, so every issue renders identically
// and nobody rebuilds the layout by hand each week in a drag and drop editor.
// The weekly job is writing the words; the HTML is not part of the weekly job.
//
// THE FORMAT is fixed at three sections, in this order:
//
//   1. Up to five job postings in AI and tech.
//   2. One reason applications get rejected, told as the pain and nothing else.
//      No fix, no before and after. The product is the resolution and it sits
//      in the call to action, so resolving it in the copy would spend the only
//      reason to click.
//   3. Hiring trends.
//
// A fixed format is easier to fill every week than a flexible one, so the type
// below is deliberately rigid: an issue missing a section does not render.
//
// Colours, fonts and radii come from EMAIL_TOKENS, the same tokens every
// transactional email uses, so the newsletter cannot drift into a second look.
//
// Table based layout with inlined styles throughout, matching layout.ts, since
// Gmail and Outlook do not reliably support anything else.
//
// The validator enforces the copy conventions in CLAUDE.md rather than trusting
// anyone to remember them at 8am on a Monday. An issue that breaks them does
// not render.

import { EMAIL_TOKENS } from '../../supabase/functions/_shared/email/tokens.ts'

const { color, font, radius, spacing, maxWidth } = EMAIL_TOKENS

/** Section one. Five roles, which is a shortlist rather than a job board. */
export const MAX_POSTINGS = 5

/**
 * The whole issue is a one minute read, not one minute per section.
 *
 * That budget is what sets everything else. At ten postings a note per role came
 * to 190 words, almost the whole budget before the prose started. At five there
 * is room for a short note on each and two pieces of prose, which is the shape
 * this format settled on.
 */
export const WORDS_PER_MINUTE = 200
export const TARGET_MINUTES = 1
export const WORD_BUDGET = WORDS_PER_MINUTE * TARGET_MINUTES
/** Fail above this. A little over is a judgement call; half as long again is not. */
export const WORD_CEILING = Math.round(WORD_BUDGET * 1.2)

export interface JobPosting {
  role: string
  company: string
  /** City, country, or the word Remote. */
  location: string
  url: string
  /**
   * Short. A handful of words on why this role is worth the click, which is the
   * only thing separating this section from a job board. Long notes are what
   * pushed the issue over budget at ten postings.
   */
  note?: string
}

/**
 * A prose section, already loaded and rendered by piece.ts. Sections two and
 * three share this shape.
 *
 * The body arrives as HTML rather than as text, because the prose is authored
 * in markdown files: writing two hundred words as a JSON string with escaped
 * newlines is miserable, and a read time typed by hand is not a measurement.
 * piece.ts owns the copy rules for this prose for the same reason.
 */
export interface Piece {
  heading: string
  /** Rendered paragraphs. Escaped at source by piece.ts. */
  html: string
  readMinutes: number
  /** Counted at source, so the issue can be measured without parsing HTML. */
  wordCount: number
  image?: { url: string; alt: string }
}

export interface Issue {
  week: number
  /** e.g. "September 2026". */
  period: string
  /**
   * Brevo merge tags are allowed here and are the reason this is its own
   * field: "Hi {{ contact.FIRSTNAME }}," renders per recipient, so the merge
   * syntax is deliberately not escaped and not checked for copy conventions.
   */
  greeting: string
  intro: string
  /** Section one, at most MAX_POSTINGS. */
  postings: JobPosting[]
  /** Section two. The pain, and only the pain. */
  rejection: Piece
  /** Section three. */
  trends: Piece
  cta: { heading: string; body: string; label: string; url: string }
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
 * copy, ranges included. The reference format this is modelled on uses em
 * dashes throughout, so copying its rhythm without this check would import the
 * habit along with the layout.
 */
const DASHES = /[-‐‑‒–—―]/

function readerFacingFields(issue: Issue): { path: string; value: string }[] {
  const fields = [
    { path: 'period', value: issue.period },
    // Merge tags are stripped first: the braces are Brevo's, not copy.
    { path: 'greeting', value: issue.greeting.replace(/\{\{[^}]*\}\}/g, '') },
    { path: 'intro', value: issue.intro },
    // The prose bodies are not listed: piece.ts checks them on their markdown
    // source, where an error can still quote the offending sentence.
    { path: 'rejection.heading', value: issue.rejection.heading },
    { path: 'trends.heading', value: issue.trends.heading },
    { path: 'cta.heading', value: issue.cta.heading },
    { path: 'cta.body', value: issue.cta.body },
    { path: 'cta.label', value: issue.cta.label },
    { path: 'signOff.name', value: issue.signOff.name },
    { path: 'signOff.role', value: issue.signOff.role },
  ]
  issue.postings.forEach((posting, i) => {
    fields.push(
      { path: `postings[${i}].role`, value: posting.role },
      { path: `postings[${i}].company`, value: posting.company },
      { path: `postings[${i}].location`, value: posting.location },
    )
    if (posting.note) fields.push({ path: `postings[${i}].note`, value: posting.note })
  })
  return fields
}

export function validateIssue(issue: Issue): string[] {
  const problems: string[] = []

  if (issue.postings.length === 0) {
    problems.push('An issue needs at least one job posting.')
  }
  if (issue.postings.length > MAX_POSTINGS) {
    problems.push(
      `At most ${MAX_POSTINGS} postings, found ${issue.postings.length}.`,
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

  issue.postings.forEach((posting, i) => {
    if (!/^https:\/\//.test(posting.url)) {
      problems.push(`postings[${i}].url must be an https URL.`)
    }
  })

  for (const [name, piece] of [['rejection', issue.rejection], ['trends', issue.trends]] as const) {
    if (piece.image && !/^https:\/\//.test(piece.image.url)) {
      problems.push(`${name}.image.url must be absolute. An inbox cannot resolve a relative path.`)
    }
    if (piece.image && !piece.image.alt.trim()) {
      problems.push(`${name}.image.alt is empty. Images are blocked by default in most clients.`)
    }
  }

  if (!/^https:\/\//.test(issue.cta.url)) problems.push('cta.url must be an https URL.')

  // The format is a one minute read for the WHOLE issue. Enforced rather than
  // hoped for, because every section feels reasonable on its own and the total
  // is the only number a reader experiences.
  const total = countIssueWords(issue)
  if (total > WORD_CEILING) {
    problems.push(
      `The issue is ${total} words, about ${(total / WORDS_PER_MINUTE).toFixed(1)} minutes. The format is ${TARGET_MINUTES} minute, ${WORD_BUDGET} words. Cut ${total - WORD_BUDGET}.`,
    )
  }

  return problems
}

/** Everything a reader reads, including both piece bodies. */
export function countIssueWords(issue: Issue): number {
  const words = (value: string) => value.split(/\s+/).filter(Boolean).length
  const framing =
    words(issue.greeting.replace(/\{\{[^}]*\}\}/g, '')) +
    words(issue.intro) +
    words(issue.cta.heading) +
    words(issue.cta.body) +
    words(issue.cta.label) +
    words(issue.signOff.name) +
    words(issue.signOff.role) +
    words(issue.rejection.heading) +
    words(issue.trends.heading)

  const postings = issue.postings.reduce(
    (total, posting) =>
      total + words(posting.role) + words(posting.company) + words(posting.location) + words(posting.note ?? ''),
    0,
  )

  return framing + postings + issue.rejection.wordCount + issue.trends.wordCount
}

// --- rendering ---------------------------------------------------------------

function sectionHeading(label: string): string {
  return `
        <tr>
          <td style="padding: ${spacing.sm} 0 ${spacing.xs};">
            <span style="font-size: 12px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: ${color.blue}; font-family: ${font.stack};">${escapeHtml(label)}</span>
          </td>
        </tr>`
}

/** Section one. A compact list, not article cards: five cards would be a scroll. */
function postingsBlock(postings: readonly JobPosting[]): string {
  const rows = postings
    .map(
      (posting) => `
              <tr>
                <td style="padding: ${spacing.sm} ${spacing.md}; border-top: 1px solid ${color.border};">
                  <a href="${escapeHtml(posting.url)}" style="font-size: 16px; font-weight: 600; line-height: 22px; color: ${color.navy}; text-decoration: none; font-family: ${font.stack};">${escapeHtml(posting.role)}</a>
                  <p style="margin: 2px 0 0; font-size: 13px; line-height: 19px; color: ${color.textSecondary}; font-family: ${font.stack};">${escapeHtml(posting.company)} &middot; ${escapeHtml(posting.location)}</p>
                  ${posting.note ? `<p style="margin: 6px 0 0; font-size: 14px; line-height: 21px; color: ${color.textPrimary}; font-family: ${font.stack};">${escapeHtml(posting.note)}</p>` : ''}
                </td>
              </tr>`,
    )
    .join('')

  return `
        <tr>
          <td style="padding: 0 0 ${spacing.md};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${color.surface}; border: 1px solid ${color.border}; border-radius: ${radius.card};">
              <tr>
                <td style="padding: ${spacing.md} ${spacing.md} 0;">
                  <p style="margin: 0; font-size: 20px; font-weight: 600; line-height: 28px; color: ${color.navy}; font-family: ${font.stack};">Worth a look this week</p>
                </td>
              </tr>${rows}
            </table>
          </td>
        </tr>`
}

/** Sections two and three. One card, optional hero, paragraphs from lines. */
function pieceBlock(piece: Piece): string {
  const imageRow = piece.image
    ? `
              <tr>
                <td style="padding: 0;">
                  <img src="${escapeHtml(piece.image.url)}" alt="${escapeHtml(piece.image.alt)}" width="100%" style="display: block; width: 100%; max-width: 100%; border: 0; border-radius: ${radius.card} ${radius.card} 0 0;" />
                </td>
              </tr>`
    : ''

  return `
        <tr>
          <td style="padding: 0 0 ${spacing.md};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${color.surface}; border: 1px solid ${color.border}; border-radius: ${radius.card};">${imageRow}
              <tr>
                <td style="padding: ${spacing.md};">
                  <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: ${color.blue}; font-family: ${font.stack};">${piece.readMinutes} min read</p>
                  <h2 style="margin: 0 0 ${spacing.xs}; font-size: 20px; line-height: 28px; font-weight: 600; color: ${color.navy}; font-family: ${font.stack};">${escapeHtml(piece.heading)}</h2>
                  <div style="font-size: 15px; line-height: 24px; color: ${color.textSecondary}; font-family: ${font.stack};">${piece.html}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
}

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
          <td style="padding: 0 0 ${spacing.md};">
            <p style="margin: 0; font-size: 16px; line-height: 26px; color: ${color.textPrimary}; font-family: ${font.stack};">${escapeHtml(issue.intro)}</p>
          </td>
        </tr>
${sectionHeading('Jobs in AI and tech')}
${postingsBlock(issue.postings)}
${sectionHeading('Why applications get rejected')}
${pieceBlock(issue.rejection)}
${sectionHeading('Hiring trends')}
${pieceBlock(issue.trends)}

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
