// Everything the weekly newsletter job decides, with no Deno and no network,
// so the repo's tsx test runner can exercise it. index.ts holds Deno.serve,
// the env reads and the four fetches; this file holds the judgement.
//
// The split, and the reason for it, is the convention stated at the top of
// brevo-stats/logic.ts.
//
// The pipeline: two public job feeds in, one rendered issue out, scheduled as
// a Brevo campaign about a day ahead. Nothing here reads candidate data. The
// postings are public job adverts and the prose is generated, so no part of
// this touches the SENSITIVE or PRODUCTION USER DATA classes.

import { MAX_POSTINGS, type JobPosting } from '../_shared/newsletter/issue.ts'

/** Absolute origin for images. An inbox has no origin to resolve against. */
export const SITE_URL = 'https://myrecruitercheck.com'

/** Five is the format. Fewer than five is a failed week, not a short issue. */
export const REQUIRED_POSTINGS = MAX_POSTINGS

/** Both feeds are public JSON with no key and no signup. */
export const FEEDS = {
  remotive: 'https://remotive.com/api/remote-jobs?category=software',
  arbeitnow: 'https://www.arbeitnow.com/api/job-board-api',
} as const

// ---------------------------------------------------------------------------
// Feed parsing
// ---------------------------------------------------------------------------

export interface FeedItem {
  role: string
  company: string
  location: string
  url: string
}

/**
 * Gender boilerplate that job boards in German speaking markets append to
 * almost every title. Noise in an English newsletter, and it eats the word
 * budget five times over.
 */
const GENDER_BOILERPLATE = /\s*\((?:[mwfvdx]\s*\/\s*)+[mwfvdx]\)|\s*\(all genders?\)/gi

/** Anything a reader would see as a dash. Mirrors the DASHES set in issue.ts. */
const DASHLIKE = /[-‐‑‒–—―]/g

/** Long enough for a real title, short enough that five fit the budget. */
const MAX_TITLE_CHARS = 70

/**
 * Cleans third party text so it can become our copy.
 *
 * The reason this exists: CLAUDE.md forbids dashes in user facing copy, and
 * validateIssue enforces that on `postings[i].role`. Real job titles are full
 * of them, so without this every single week would fail to render. Exempting
 * the field instead would be weakening a check to make a diff pass.
 *
 * A separating dash becomes a comma, which preserves the meaning: "Lead Data
 * Engineer, Data Platform and AI" says what the employer said. A hyphen inside
 * a word becomes a space, matching how this codebase writes "full stack"
 * anyway. Nothing is invented and no word is dropped except the boilerplate.
 *
 * Over the length cap it is cut at the last comma rather than mid phrase, so a
 * trimmed title still reads as a title.
 */
export function normaliseText(value: string, maxChars = MAX_TITLE_CHARS): string {
  let out = value
    .replace(GENDER_BOILERPLATE, '')
    // A dash with space around it separates two ideas; a comma does the same
    // job. A dash inside a word joins two words; a space does that job.
    .replace(new RegExp(`\\s+${DASHLIKE.source}\\s+`, 'g'), ', ')
    .replace(DASHLIKE, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '')

  if (out.length > maxChars) {
    const cut = out.lastIndexOf(', ', maxChars)
    out = cut > 20 ? out.slice(0, cut) : out.slice(0, out.lastIndexOf(' ', maxChars))
    out = out.replace(/^[\s,]+|[\s,]+$/g, '')
  }
  return out
}

/**
 * Role types that are wrong for this audience whatever the title says.
 * Werkstudent, Praktikum and Ausbildung are student, internship and
 * apprenticeship postings; the newsletter goes to people applying for jobs.
 */
const WRONG_ROLE_TYPES = /\b(werkstudent|praktikum|praktikant|ausbildung|azubi|intern|internship|apprentice|thesis|abschlussarbeit)\b/i

/**
 * Feed responses are third party and untrusted, so every field is checked
 * rather than asserted. A malformed entry is dropped, never repaired: a job
 * board changing its shape should cost us one posting, not produce an issue
 * with the word "undefined" in it.
 */
function toItem(raw: unknown, fields: { role: string; company: string; location: string; url: string }): FeedItem | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>

  const role = typeof record[fields.role] === 'string' ? (record[fields.role] as string).trim() : ''
  const company = typeof record[fields.company] === 'string' ? (record[fields.company] as string).trim() : ''
  const location = typeof record[fields.location] === 'string' ? (record[fields.location] as string).trim() : ''
  const url = typeof record[fields.url] === 'string' ? (record[fields.url] as string).trim() : ''

  if (!role || !company || !url) return null
  // validateIssue refuses a non https posting link, so filter here rather than
  // letting it fail the whole issue at render time.
  if (!url.startsWith('https://')) return null
  if (WRONG_ROLE_TYPES.test(role)) return null

  const cleanRole = normaliseText(role)
  const cleanCompany = normaliseText(company, 40)
  if (!cleanRole || !cleanCompany) return null

  return {
    role: cleanRole,
    company: cleanCompany,
    location: normaliseText(location, 40) || 'Remote',
    url,
  }
}

export function parseRemotive(payload: unknown): FeedItem[] {
  const jobs = (payload as { jobs?: unknown })?.jobs
  if (!Array.isArray(jobs)) return []
  return jobs
    .map((j) => toItem(j, { role: 'title', company: 'company_name', location: 'candidate_required_location', url: 'url' }))
    .filter((i): i is FeedItem => i !== null)
}

export function parseArbeitnow(payload: unknown): FeedItem[] {
  const data = (payload as { data?: unknown })?.data
  if (!Array.isArray(data)) return []
  return data
    .map((j) => toItem(j, { role: 'title', company: 'company_name', location: 'location', url: 'url' }))
    .filter((i): i is FeedItem => i !== null)
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/**
 * Ranked, not just filtered. A week that surfaces five machine learning roles
 * is a better issue than one that surfaces five generic developer roles, so
 * the strong terms are tried first and the broad ones only fill the gap.
 */
const STRONG_TERMS = [
  'machine learning', 'artificial intelligence', ' ai ', 'ai/', 'llm', 'nlp',
  'deep learning', 'data scientist', 'data science', 'mlops', 'computer vision',
]
const BROAD_TERMS = [
  'data engineer', 'data analyst', 'analytics', 'backend', 'back end', 'frontend',
  'front end', 'full stack', 'fullstack', 'software engineer', 'developer',
  'platform engineer', 'devops', 'infrastructure', 'cloud', 'python',
]

/** Padded so ' ai ' cannot match inside "detail" or "chair". */
function tier(role: string): 0 | 1 | 2 {
  const haystack = ` ${role.toLowerCase()} `
  if (STRONG_TERMS.some((t) => haystack.includes(t))) return 0
  if (BROAD_TERMS.some((t) => haystack.includes(t))) return 1
  return 2
}

/**
 * Picks the week's five.
 *
 * `alreadySent` carries the posting URLs from recent issues. Repeating a role
 * a subscriber saw a fortnight ago reads as a broken feed, and it is the most
 * likely way this job embarrasses itself, so dedupe happens before the count
 * check rather than after.
 *
 * One role per company, because five openings at one employer is that
 * employer's careers page, not a newsletter.
 */
export function selectPostings(items: FeedItem[], alreadySent: Iterable<string>): FeedItem[] {
  const seenUrls = new Set(alreadySent)
  const seenCompanies = new Set<string>()
  const chosen: FeedItem[] = []

  const eligible = items
    .filter((i) => tier(i.role) < 2)
    .map((item, index) => ({ item, index, rank: tier(item.role) }))
    // Stable within a tier: index breaks the tie, so the same feed produces
    // the same issue and a test is not at the mercy of sort implementation.
    .sort((a, b) => a.rank - b.rank || a.index - b.index)

  for (const { item } of eligible) {
    if (chosen.length >= REQUIRED_POSTINGS) break
    const company = item.company.toLowerCase()
    if (seenUrls.has(item.url) || seenCompanies.has(company)) continue
    seenUrls.add(item.url)
    seenCompanies.add(company)
    chosen.push(item)
  }

  return chosen
}

// ---------------------------------------------------------------------------
// The rejection angle
// ---------------------------------------------------------------------------

/**
 * The angles are written by a person and fixed here on purpose.
 *
 * Section two is deliberately painful copy aimed at people who are being
 * rejected from jobs, and it goes out every week with nobody reading it first.
 * A model inventing the angle as well as the prose is the one place this
 * system could say something genuinely cruel. So the frame is approved in
 * advance and the model only writes within it.
 *
 * Each is a rejection reason, never advice: the fix is the product, and it
 * sits in the call to action. Resolving it in the copy spends the only reason
 * to click.
 */
export const REJECTION_ANGLES: readonly string[] = [
  'The reader spent eleven seconds and could not find the one thing the posting asked for. They did not decide you could not do the job. They decided they could not tell.',
  'Your CV was strong and aimed at nobody. Nothing in it was wrong, and nothing in it was about this role.',
  'The evidence was on page two. The decision was made on page one.',
  'You described responsibilities. They were looking for a result, and could not find one they could point at.',
  'The posting named a tool six times. Your CV named it once, in a list, at the bottom.',
  'Your most relevant work was four years back and read as history rather than as what you do.',
  'Every line was true and none of it was specific. It could have been about four hundred other people.',
  'The job asked for someone who had done this before. You had. It just was not visible without reading all of it.',
]

/** Rotates by week, so the same pain is not sent a fortnight running. */
export function angleForWeek(week: number): string {
  return REJECTION_ANGLES[((week % REJECTION_ANGLES.length) + REJECTION_ANGLES.length) % REJECTION_ANGLES.length]
}

/** The four images in public/newsletter/, paired and rotated by week. */
const IMAGE_PAIRS = [
  {
    rejection: { url: '/newsletter/reviewing-an-application.jpg', alt: 'Two people at a desk reviewing a printed document beside open laptops' },
    trends: { url: '/newsletter/connected-data.jpg', alt: 'Abstract connected cubes forming a network against a dark background' },
  },
  {
    rejection: { url: '/newsletter/ai-systems.jpg', alt: 'Abstract illustration of layered circuitry and light' },
    trends: { url: '/newsletter/analytics-dashboard.jpg', alt: 'Charts and figures on a screen showing an analytics view' },
  },
] as const

export function imagesForWeek(week: number) {
  return IMAGE_PAIRS[((week % IMAGE_PAIRS.length) + IMAGE_PAIRS.length) % IMAGE_PAIRS.length]
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const ZONE = 'Europe/Amsterdam'

/** Offset in minutes that `zone` is ahead of UTC at the given instant. */
function zoneOffsetMinutes(zone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
    .formatToParts(at)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value
      return acc
    }, {})

  // Hour 24 appears at midnight in some ICU versions under hour12: false.
  const hour = Number(parts.hour) % 24
  const asIfUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    hour, Number(parts.minute), Number(parts.second),
  )
  return (asIfUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000
}

/** The calendar date in `zone` at a given instant. */
function zoneDateParts(zone: string, at: Date): { year: number; month: number; day: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  })
  const parts = fmt.formatToParts(at).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value
    return acc
  }, {})
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: weekdays.indexOf(parts.weekday),
  }
}

/**
 * The instant of 09:00 Amsterdam on the first Monday strictly after `now`.
 *
 * Amsterdam is UTC+1 or UTC+2 depending on the date, so the offset is derived
 * rather than assumed. Two passes: guess the instant using the offset in force
 * at the naive time, then re derive at that instant and correct. 09:00 never
 * falls inside a transition (they happen at 02:00 and 03:00 local), so this
 * converges rather than oscillating.
 *
 * Returned as a UTC instant. Brevo accepts an offset form too, but a Z string
 * cannot be misread by whichever timezone the account is configured in.
 */
export function nextMondayNineAm(now: Date): Date {
  const today = zoneDateParts(ZONE, now)
  const daysAhead = ((1 - today.weekday + 7) % 7) || 7

  const target = new Date(Date.UTC(today.year, today.month - 1, today.day + daysAhead, 9, 0, 0))
  const firstGuess = target.getTime() - zoneOffsetMinutes(ZONE, target) * 60000
  const corrected = target.getTime() - zoneOffsetMinutes(ZONE, new Date(firstGuess)) * 60000
  return new Date(corrected)
}

/** ISO 8601 week number and its week-numbering year. */
export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  // Thursday decides the year an ISO week belongs to.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { year: d.getUTCFullYear(), week }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export function periodLabel(date: Date): string {
  const { year, month } = zoneDateParts(ZONE, date)
  return `${MONTHS[month - 1]} ${year}`
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export interface Generated {
  subject: string
  intro: string
  postingNotes: string[]
  rejection: { heading: string; body: string }
  trends: { heading: string; body: string }
}

export const GENERATION_MODEL = 'gpt-4o-mini'

/**
 * One call produces every piece of copy in the issue.
 *
 * Deliberately one call and not four: the intro promises what the sections
 * deliver, and the trends observation is about the same five roles the notes
 * describe. Generating them separately makes them disagree.
 *
 * The copy conventions are stated here AND enforced by validateIssue after the
 * fact. The prompt is the request; the validator is the gate. A model that
 * ignores the dash rule fails the render, which is the behaviour we want, so
 * this text is never the only thing standing between a rule and an inbox.
 */
export function buildGenerationRequestBody(
  postings: FeedItem[],
  angle: string,
  avoidHeadings: string[],
  correctionNote: string | null,
): Record<string, unknown> {
  const roleList = postings
    .map((p, i) => `${i + 1}. ${p.role} at ${p.company}, ${p.location}`)
    .join('\n')

  const system = [
    'You write one issue of a weekly email for people applying for jobs in AI and tech.',
    '',
    'HARD COPY RULES. Output that breaks one of these is rejected and rewritten:',
    '- Never use a dash of any kind. No hyphen, en dash or em dash. Spell ranges out, so "two to three" and not "2-3". Write compound words as separate words.',
    '- Plain sentences. No headings, lists, markdown, links or emoji in any body.',
    '- Never invent a statistic, a company, a salary or a source.',
    '',
    'LENGTH. The whole email is a one minute read, so every section is short:',
    '- intro: about fifteen words, one sentence.',
    '- each posting note: at most seven words, no full stop needed.',
    '- rejection body: about fifty five words, three short paragraphs at most.',
    '- trends body: about forty words.',
    '',
    'THE REJECTION SECTION is the pain and nothing else. State what went wrong and',
    'stop. Do not give advice, do not offer a fix, do not say "instead" or "try".',
    'The product is the fix and it appears later in the email, so resolving it here',
    'wastes the only reason to click. Write in the second person, addressed to one',
    'reader. Be plain rather than dramatic.',
    '',
    'THE TRENDS SECTION is one observation about the five roles below, drawn only',
    'from their titles and companies. Say what the pattern is and what it tells a',
    'reader about what employers will recognise. No advice.',
  ].join('\n')

  const user = [
    `This week's five roles:\n${roleList}`,
    '',
    `The rejection reason to write about, which is fixed and must not be changed:\n${angle}`,
    '',
    avoidHeadings.length > 0
      ? `Recent rejection headings. Do not repeat these or write a near variant:\n${avoidHeadings.map((h) => `- ${h}`).join('\n')}`
      : '',
    '',
    'Write one note for each of the five roles, in the same order, saying briefly',
    'why it is worth a look. Base it only on the role title, company and location.',
    correctionNote
      ? `\nYour previous response was rejected. Fix exactly this and change nothing else:\n${correctionNote}`
      : '',
  ].filter(Boolean).join('\n')

  return {
    model: GENERATION_MODEL,
    temperature: 0.6,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'newsletter_issue',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['subject', 'intro', 'postingNotes', 'rejection', 'trends'],
          properties: {
            subject: { type: 'string' },
            intro: { type: 'string' },
            postingNotes: { type: 'array', items: { type: 'string' } },
            rejection: {
              type: 'object',
              additionalProperties: false,
              required: ['heading', 'body'],
              properties: { heading: { type: 'string' }, body: { type: 'string' } },
            },
            trends: {
              type: 'object',
              additionalProperties: false,
              required: ['heading', 'body'],
              properties: { heading: { type: 'string' }, body: { type: 'string' } },
            },
          },
        },
      },
    },
  }
}

/**
 * A link or a bare URL anywhere in generated prose.
 *
 * SECURITY. Role and company names come from public job feeds, are chosen by
 * whoever posted the advert, and are put into the prompt. That is a prompt
 * injection surface: a title crafted as an instruction could try to make the
 * model write whatever the poster wants into an email going to the whole list.
 *
 * Most of the damage is already contained. piece.ts escapes before producing
 * markup so no HTML survives, validateIssue caps the length and refuses the
 * copy conventions being broken, and the rejection angle is fixed in code
 * rather than chosen by the model. The one thing that would still get through
 * is a link, because renderInline deliberately supports markdown links for
 * authored pieces. Generated prose has no legitimate need for one, so it is
 * refused outright here rather than relying on the prompt to ask nicely.
 */
const LINK_IN_PROSE = /\]\(|https?:\/\/|www\.|<a\s/i

/** Shape check on the model's JSON before anything downstream trusts it. */
export function parseGeneration(raw: unknown, expectedNotes: number): Generated {
  const g = raw as Partial<Generated>
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

  const subject = str(g?.subject)
  const intro = str(g?.intro)
  const rejection = { heading: str(g?.rejection?.heading), body: str(g?.rejection?.body) }
  const trends = { heading: str(g?.trends?.heading), body: str(g?.trends?.body) }
  const postingNotes = Array.isArray(g?.postingNotes) ? g.postingNotes.map(str) : []

  const missing: string[] = []
  if (!subject) missing.push('subject')
  if (!intro) missing.push('intro')
  if (!rejection.heading || !rejection.body) missing.push('rejection')
  if (!trends.heading || !trends.body) missing.push('trends')
  if (postingNotes.length !== expectedNotes || postingNotes.some((n) => !n)) {
    missing.push(`postingNotes (expected ${expectedNotes}, usable ${postingNotes.filter(Boolean).length})`)
  }
  if (missing.length > 0) throw new Error(`Generated issue is incomplete: ${missing.join(', ')}`)

  // See LINK_IN_PROSE. The feeds are attacker influenceable and reach the
  // prompt; a link is the one payload that would otherwise survive to an inbox.
  for (const [field, value] of [
    ['subject', subject], ['intro', intro],
    ['rejection.heading', rejection.heading], ['rejection.body', rejection.body],
    ['trends.heading', trends.heading], ['trends.body', trends.body],
    ...postingNotes.map((n, i) => [`postingNotes[${i}]`, n] as [string, string]),
  ] as [string, string][]) {
    if (LINK_IN_PROSE.test(value)) {
      throw new Error(`Generated ${field} contains a link, which generated copy may never do: "${value}"`)
    }
  }

  return { subject, intro, postingNotes, rejection, trends }
}

/**
 * Rebuilds the markdown a hand written piece would have been, so the generated
 * prose goes through exactly the same loader as an authored one.
 *
 * This is the point of doing it this way: piece.ts already refuses dashes,
 * headings, tables, block quotes, raw HTML and a missing alt text, and it
 * escapes before producing markup. Reusing it means the model's output is held
 * to the identical standard as a person's, with no second implementation of
 * the rules to drift.
 */
export function buildPieceSource(
  heading: string,
  image: { url: string; alt: string },
  body: string,
): string {
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).join('\n\n')
  return `---\nheading: ${heading}\nimage: ${image.url}\nimageAlt: ${image.alt}\n---\n\n${paragraphs}\n`
}

export function absolutise(url: string): string {
  return url.startsWith('/') ? `${SITE_URL}${url}` : url
}

export function toPostings(items: FeedItem[], notes: string[]): JobPosting[] {
  return items.map((item, i) => ({
    role: item.role,
    company: item.company,
    location: item.location,
    url: item.url,
    note: notes[i],
  }))
}

// ---------------------------------------------------------------------------
// Brevo campaign
// ---------------------------------------------------------------------------

export const BREVO_CAMPAIGN_ENDPOINT = 'https://api.brevo.com/v3/emailCampaigns'

/**
 * A campaign, scheduled rather than sent.
 *
 * scheduledAt is what makes this safe to run unattended: the issue goes out
 * without anybody doing anything, and there is still a window in which a bad
 * week can be cancelled in Brevo before it reaches a single inbox. Email
 * cannot be recalled, and this is the only cheap insurance against that.
 */
export function buildCampaignPayload(params: {
  year: number
  week: number
  subject: string
  html: string
  listId: number
  scheduledAt: Date
  senderName: string
  senderEmail: string
  replyTo?: string
}): Record<string, unknown> {
  return {
    name: `Weekly newsletter ${params.year} week ${params.week}`,
    subject: params.subject,
    type: 'classic',
    sender: { name: params.senderName, email: params.senderEmail },
    htmlContent: params.html,
    recipients: { listIds: [params.listId] },
    scheduledAt: params.scheduledAt.toISOString(),
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
  }
}
