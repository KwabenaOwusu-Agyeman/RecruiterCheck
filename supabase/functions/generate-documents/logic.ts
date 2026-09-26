// Pure, network-free logic split out of index.ts so it can be unit tested
// (via `npx tsx`/Deno test) without needing the OpenAI call or Deno runtime.

export interface ExperienceBullet {
  text: string
  // Only ever true for a bullet the case-(C) prompt instruction deliberately
  // composed to hold space for a feedback area the candidate's real CV has
  // no evidence for — uses the app's own placeholder vocabulary (e.g. "X%")
  // on purpose, watermarked and disclosed rather than being real content.
  is_placeholder: boolean
}

export interface ExperienceEntry {
  title: string
  company_location: string
  dates: string
  bullets: ExperienceBullet[]
}

export interface EducationEntry {
  degree: string
  institution: string
  dates: string
}

export interface SectionLabels {
  summary: string
  experience: string
  education: string
  languages: string
}

export interface TailoredCv {
  full_name: string
  contact_line: string
  professional_summary: string
  experience: ExperienceEntry[]
  education: EducationEntry[]
  languages: string[]
  section_labels: SectionLabels
  // One line from a credited Evidence Follow Up answer, printed under
  // FOLLOW_UP_SECTION_HEADING. Absent or empty when there is none.
  follow_up_bullet?: string
}

export interface CoverLetter {
  company_location: string
  salutation: string
  intro_paragraph: string
  body_paragraphs: string[]
  conclusion_paragraph: string
  thank_you_line: string
  closing_phrase: string
}

export interface RecruiterMessage {
  greeting: string
  body: string
  closing_line: string
  sign_off: string
}

export interface ImprovementClassification {
  case: 'A' | 'B' | 'C' | 'D'
}

export interface RawDocuments {
  tailored_cv: TailoredCv
  cover_letter: CoverLetter
  recruiter_message: RecruiterMessage
  new_claims_introduced: string[]
  improvement_classifications: ImprovementClassification[]
}

// Defensive caps on top of the prompt's own instructions, so the shrink-to-fit
// pass in renderCvPdf/renderCoverLetterPdf can reliably keep each to a single page.
export const MAX_EXPERIENCE_ENTRIES = 4
export const MAX_BULLETS_PER_ENTRY = 4
export const MAX_EDUCATION_ENTRIES = 2
export const REQUIRED_BODY_PARAGRAPHS = 3

export const ENGLISH_TELLS = [' the ', ' and ', ' your ', ' that ', ' with ', ' this ', ' for ', ' you ', ' are ', ' have ']

// ---------------------------------------------------------------------------
// Document entitlement: which document types this check may generate.
//
// A document is only ever generated when BOTH conditions hold:
//  1. The pack that funded this check entitles it (unchanged, pre-existing
//     behavior — see FundingPackId below).
//  2. The check's own score group permits it (new product decision, layered
//     on top of the pack entitlement, never a substitute for it).
//
// Score group thresholds mirror getScoreLabel in src/lib/scoring.ts exactly
// (score <= 60: "Not a Fit", 61-84: "Needs Improvement", 85+: "Likely
// Interview Candidate") — duplicated here rather than imported, the same
// established pattern this Edge Function already used for MIN_DOCUMENT_SCORE
// before this change, since a Deno Edge Function and the Vite frontend are
// separate deploy units.
//
// Rules:
//  - Not a Fit: no CV, no cover letter, no recruiter message, regardless of
//    pack.
//  - Needs Improvement: CV/cover letter/recruiter message each permitted
//    when the pack entitles them.
//  - Likely Interview Candidate: CV never permitted, regardless of pack;
//    cover letter/recruiter message permitted when the pack entitles them.
//
// This same function is called from both the server (generate-documents,
// the actual enforcement point — a direct API call cannot bypass it) and
// can be reused by the frontend for UI purposes; the frontend copy is for
// display only and is never the source of truth.
// ---------------------------------------------------------------------------

export type FundingPackId = 'small' | 'medium' | 'large' | null

// 'small'/'medium'/'large' are private, internal identifiers only — the
// literal values already threaded through Stripe metadata,
// credit_batches.pack_id, and checks.funding_pack_id. Never surfaced to a
// user directly; every user facing message uses PACK_DISPLAY_NAMES instead.
// The one canonical mapping, kept in sync by hand with CHECK_PACKS/
// PACK_DISPLAY_NAMES in src/lib/constants.ts (separate deploy unit, no
// shared module boundary between the Deno Edge Function and the Vite
// frontend).
export const PACK_DISPLAY_NAMES: Record<'small' | 'medium' | 'large', string> = {
  small: 'Starter',
  medium: 'Active',
  large: 'Power',
}

export const NOT_A_FIT_MAX_SCORE = 60
export const LIKELY_INTERVIEW_CANDIDATE_MIN_SCORE = 85

export interface DocumentEntitlement {
  cv: boolean
  coverLetter: boolean
  recruiterMessage: boolean
  // Null when at least one document is available; otherwise a user facing
  // reason the caller can surface directly.
  blockedReason: string | null
}

export function getDocumentEntitlement(fundingPackId: FundingPackId, score: number): DocumentEntitlement {
  const hasAnyPackEntitlement = fundingPackId === 'small' || fundingPackId === 'medium' || fundingPackId === 'large'

  if (!hasAnyPackEntitlement) {
    return {
      cv: false,
      coverLetter: false,
      recruiterMessage: false,
      blockedReason:
        `This check only includes the Interview Score and Recruiter Feedback. Buy any check pack for your next check to unlock the Improved CV Draft, and the ${PACK_DISPLAY_NAMES.large} pack to also get the Cover Letter and Recruiter Message.`,
    }
  }

  if (score <= NOT_A_FIT_MAX_SCORE) {
    return {
      cv: false,
      coverLetter: false,
      recruiterMessage: false,
      blockedReason:
        'Documents are only generated for a score of 61 or above. A lower score means this role is not a strong match for your CV.',
    }
  }

  const isLikelyInterviewCandidate = score >= LIKELY_INTERVIEW_CANDIDATE_MIN_SCORE

  const entitlement: DocumentEntitlement = {
    cv: hasAnyPackEntitlement && !isLikelyInterviewCandidate,
    coverLetter: fundingPackId === 'large',
    recruiterMessage: fundingPackId === 'large',
    blockedReason: null,
  }

  if (!entitlement.cv && !entitlement.coverLetter && !entitlement.recruiterMessage) {
    return {
      ...entitlement,
      blockedReason:
        `Your Interview Score is already strong for this role, so an Improved CV Draft is not offered at this score. Upgrade to the ${PACK_DISPLAY_NAMES.large} pack for a Cover Letter and Recruiter Message.`,
    }
  }

  return entitlement
}

export function looksLikeEnglish(text: string): boolean {
  const padded = ` ${text.toLowerCase()} `
  return ENGLISH_TELLS.filter((tell) => padded.includes(tell)).length >= 5
}

/**
 * Splits text into sentences on ., !, or ?. Decimal points inside numbers
 * (e.g. "7.2%") are protected first so a stat like that never gets split
 * into two fragments ("7." and "2%") — a real bug this app hit, since CVs
 * routinely cite decimal metrics and the naive split would corrupt them.
 *
 * The sentence-content group is a lazy `[\s\S]*?` rather than `[^.!?]+`, and
 * the terminator is checked with a lookahead rather than being consumed
 * before the whitespace check. That matters for a token like "Node.js":
 * with `[^.!?]+[.!?]+(\s+|$)`, the only way to satisfy "punctuation
 * followed by whitespace/end" was to skip past the un-spaced period
 * entirely — and since a failed match at one start position makes regex
 * matching retry from the next character rather than back up, every
 * attempt starting before "Node.js" failed the same way, so the whole
 * prefix up to it silently vanished from the output (not just a bad split
 * point — real content deleted with no error). The lazy content group can
 * absorb a mid-word period like that as ordinary text and keep extending
 * until it reaches a terminator the lookahead actually accepts.
 */
export function splitSentences(text: string): string[] {
  const DECIMAL_MARK = '@@DECIMAL@@'
  const protectedText = text.replace(/(\d)\.(\d)/g, `$1${DECIMAL_MARK}$2`)
  return (protectedText.match(/[\s\S]*?[.!?]+(?:\s+|$)/g) ?? [protectedText])
    .map((sentence) => sentence.trim().split(DECIMAL_MARK).join('.'))
    .filter(Boolean)
}

/**
 * Checks whether any name part (first, last, etc, each 3+ letters to avoid
 * false positives on short/common words) from fullName appears as a whole
 * word inside text — a signal the letter was written about the candidate in
 * the third person instead of in their own first-person voice.
 */
export function containsName(text: string, fullName: string): boolean {
  const nameParts = fullName.split(/\s+/).filter((part) => part.length >= 3)
  return nameParts.some((part) => {
    const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
  })
}

/**
 * Removes every hyphen, en dash, and em dash from model-composed prose — a
 * hard rule for this app. The prompt already asks for this, but the model
 * still slips on common compounds (e.g. "problem-solving"), so this sanitizes
 * the text deterministically instead of relying on reject-and-retry, which
 * could otherwise fail the whole generation if the model keeps repeating it.
 */
export function stripDashes(text: string): string {
  return text
    // Date ranges like "2020-2023" or "2020 - 2023" -> "2020 to 2023".
    .replace(/\b(\d{4})\s*[-–—]\s*(\d{4})\b/g, '$1 to $2')
    // Compound words: a dash directly between two word characters -> space
    // (e.g. "ad-hoc" -> "ad hoc", "self-motivated" -> "self motivated").
    .replace(/(\w)[-–—](?=\w)/g, '$1 ')
    // Any remaining dash (used as a clause separator) -> comma.
    .replace(/\s*[-–—]\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/ ,/g, ',')
    .trim()
}

// Placeholder patterns that are only ever legitimate inside a feedback
// "Example: ..." clause, or inside a CV bullet explicitly marked
// is_placeholder: true (see validateDocuments) — never anywhere else in a
// final generated document. Two shapes are recognized: the classic "X%"
// style token (for a metric a case-(C) bullet can't verify), and any short
// bracketed phrase (for a qualitative gap that has no natural metric, e.g.
// "[a relevant language course]" for a missing credential). The bracket
// form is intentionally generic rather than an enumerated word list, since
// case-(C) areas to improve cover a much wider range of missing evidence
// than percentages alone (training, certifications, language level, tools,
// soft skills) and a fixed word list can't anticipate all of them.
const PLACEHOLDER_PATTERN = /\bX\s?%|\bX\s?(percent|months?|years?|customers?|clients?|hours?|days?|weeks?)\b|€\s?X\b|\$\s?X\b|\[[^[\]]{1,60}\]/i

export function containsPlaceholder(text: string): boolean {
  return PLACEHOLDER_PATTERN.test(text)
}

/**
 * Areas to improve are stored as "Finding. Evidence. Sample wording: ..."
 * (checks generated under the sample wording rules) or the historical
 * "Finding. Evidence. Example: ...". The trailing clause exists only to show
 * a human reader on the Feedback page what a stronger bullet could look
 * like: sample wording is fictional by design and a legacy example carries
 * "X%" style placeholders. The document generator must act on the
 * finding/evidence and never copy either into a real document, so this
 * strips the clause before the text reaches the prompt.
 */
export function stripExampleClause(text: string): string {
  return text.replace(/\s*(?:Sample wording|Example):\s*[\s\S]*$/i, '').trim()
}

/**
 * Which documents the caller will actually deliver. A document that will not
 * be rendered is still normalised and returned, but its own content checks
 * are skipped: a Starter or Active CV request should not fail, or burn a
 * retry, because of a cover letter nobody will receive.
 */
export interface ValidationScope {
  coverLetter: boolean
  recruiterMessage: boolean
  // True when the CV is entitled and a credited follow up answer was sent: the
  // CV must then carry its one follow up bullet. Otherwise any bullet is dropped.
  followUpBullet?: boolean
  // That credited answer, the original CV text it was not on, and the job it is
  // for. When present, the answer's own facts may appear only in the follow up
  // bullet: see answerOnlyFacts.
  followUpSource?: { answer: string; cvText: string } & JobContext
  // What to do with a draft that repeats them elsewhere: 'reject' (the default)
  // throws FollowUpRepeatedError so the next attempt can rewrite it; 'remove'
  // drops the sentences and bullets that repeat them, so the check can never be
  // the reason a generation fails. The caller uses 'remove' on its last draft.
  followUpRepeats?: 'reject' | 'remove'
}

const VALIDATE_EVERYTHING: ValidationScope = { coverLetter: true, recruiterMessage: true }

// Fixed in code, never written by the model, like the draft watermark.
export const FOLLOW_UP_SECTION_HEADING = 'Additional Relevant Experience'

// Added to tailored_cv's schema only when a credited follow up answer is sent,
// so every other generation requests exactly the schema it always did.
export const FOLLOW_UP_BULLET_SCHEMA = {
  type: 'string',
  description: "One CV bullet built only from the candidate's follow up answer; see the CANDIDATE-REPORTED instructions.",
} as const

// Appended to the system prompt only alongside FOLLOW_UP_BULLET_SCHEMA. The
// answer's facts go into that one bullet, printed under its own heading, so
// they are never mixed into the CV's employment history or restated elsewhere.
export const FOLLOW_UP_DOCUMENT_ADDENDUM = `
The original CV text below ends with a section headed "=== CANDIDATE-REPORTED ADDITIONAL EVIDENCE ===". It holds the candidate's own answer to one follow up question about the requirement it names, already assessed as specific and credible. Turn that answer into exactly one CV bullet in tailored_cv.follow_up_bullet: past tense, first person implied, no subject pronoun, roughly 15 to 35 words, using only the facts the answer states. Keep every number, tool and outcome the answer gives; never add a number, date, employer, tool or outcome it does not state, and never use brackets or placeholders. Never mention a follow up question, that the answer is self reported, or MyRecruiterCheck. That bullet is the only place the answer may appear. The application prints it under its own heading and rejects any draft where a tool, number, project or outcome found only in that section appears anywhere else, so write the professional summary, every experience entry, cover_letter and recruiter_message exactly as you would without the section. If an area to improve below is answered by this section, classify it as case (A) and add no placeholder bullet for it, but do not surface the answer in cover_letter, recruiter_message or anywhere else in tailored_cv: follow_up_bullet alone addresses it. For new_claims_introduced, facts in follow_up_bullet count as present in the source only when that section states them; every other field must still trace to the CV itself.
`

// ---------------------------------------------------------------------------
// A credited answer's facts stay in the follow up bullet
// ---------------------------------------------------------------------------

// Figures as written, with a thousands comma removed so "1,500" and "1500" match.
function figuresIn(text: string): Set<string> {
  return new Set(text.replace(/(\d),(?=\d{3}(?!\d))/g, '$1').match(/\d+(?:\.\d+)?/g) ?? [])
}

const NAME_WORD = String.raw`[A-Z][A-Za-z0-9+#]*(?:[.\-][A-Za-z0-9]+)*`
const NAME_SEQUENCE = new RegExp(`${NAME_WORD}(?:[ \\t]+${NAME_WORD})*`, 'g')
const FUNCTION_WORDS = new Set([
  'a', 'after', 'also', 'an', 'and', 'as', 'at', 'before', 'but', 'by', 'during', 'for', 'from', 'here', 'i',
  'in', 'it', 'my', 'of', 'on', 'or', 'our', 'over', 'since', 'so', 'that', 'the', 'then', 'there', 'these',
  'this', 'those', 'to', 'we', 'when', 'while', 'with',
])

// Where a capital says nothing: the start of the text, of a line, of a
// sentence, or of a list item ("- Reduced", "• Managed", "1) Led").
function opensSentence(before: string): boolean {
  return /(^|\n)[ \t]*([-–—•·*]|\d+[.)])?[ \t]*$/.test(before) || /[.!?:;"“(\-–—•·*][ \t]*$/.test(before)
}

// Capitalised names in the answer: tools, products, employers, places. A word
// capitalised only because it opens a sentence is dropped unless it is plainly
// a name anyway ("FastAPI", "AWS", "S3"). Function words, "I" included, split a
// run ("Using Docker I built" gives "Docker"). A name under three characters
// ("Go", "UX") is too common to tell apart unless it holds a digit or symbol.
function namedTermsIn(text: string): string[] {
  const names: string[] = []
  for (const match of text.matchAll(NAME_SEQUENCE)) {
    const words = match[0].split(/[ \t]+/)
    if (opensSentence(text.slice(0, match.index)) && !/.[A-Z0-9]/.test(words[0])) words.shift()
    let run: string[] = []
    for (const word of [...words, 'i']) {
      if (!FUNCTION_WORDS.has(word.toLowerCase())) {
        run.push(word)
        continue
      }
      const name = run.join(' ').replace(/-/g, ' ')
      if (name.length >= 3 || /[0-9+#]/.test(name)) names.push(name)
      run = []
    }
  }
  return names.filter(Boolean)
}

// True when text names phrase as whole words; in any case unless caseSensitive.
function mentions(text: string, phrase: string, caseSensitive = false): boolean {
  const pattern = phrase
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+')
  return new RegExp(`(?:^|[^A-Za-z0-9])${pattern}(?![A-Za-z0-9])`, caseSensitive ? '' : 'i').test(text.replace(/[-–—]/g, ' '))
}

// What the documents must be free to name whatever the answer says: the role
// and the employer the candidate is applying to, and the job ad's own figures.
export interface JobContext {
  jobTitle?: string | null
  companyName?: string | null
  jobDescription?: string | null
}

/**
 * The facts a credited answer adds that the CV itself does not show: its
 * figures and its capitalised names. They may appear only in the follow up
 * bullet. Deliberately narrow, so a false alarm is rare: the role and the
 * employer applied to are never counted, nor a figure the job ad itself gives,
 * and a single digit, a figure in words ("three months") or a lowercase tool is
 * left to the prompt.
 */
export function answerOnlyFacts(answer: string, cvText: string, job: JobContext = {}): { figures: string[]; names: string[] } {
  const known = figuresIn(`${cvText}\n${job.jobTitle ?? ''}\n${job.companyName ?? ''}\n${job.jobDescription ?? ''}`)
  const applyingTo = `${job.jobTitle ?? ''}\n${job.companyName ?? ''}`
  return {
    figures: [...figuresIn(answer)].filter((figure) => figure.replace('.', '').length >= 2 && !known.has(figure)),
    names: [...new Set(namedTermsIn(answer))].filter((name) => !mentions(cvText, name) && !mentions(applyingTo, name)),
  }
}

/**
 * Which of those facts text repeats. A name must match its capitals here, so
 * ordinary words ("I excel", "go live", "cross functional teams") never count;
 * the CV check above ignores case, so a name the CV has in any case is free.
 */
export function repeatedAnswerFacts(text: string, facts: { figures: string[]; names: string[] }): string[] {
  const textFigures = figuresIn(text)
  return [
    ...facts.figures.filter((figure) => textFigures.has(figure)),
    ...facts.names.filter((name) => mentions(text, name, true)),
  ]
}

const ABBREVIATION_END = /\b(?:e\.g|i\.e|etc|vs|approx|incl|Mr|Mrs|Ms|Dr|St)\.$/i

// Sentences, keeping any trailing fragment with no full stop. A stop may be
// followed by a closing quote or bracket, and an abbreviation ("e.g.") does not
// end a sentence, so removing one never leaves a broken fragment behind.
function sentencesOf(text: string): string[] {
  const sentences: string[] = []
  for (const piece of text.split(/(?<=[.!?]["”’')\]]?)\s+/).map((part) => part.trim()).filter(Boolean)) {
    const last = sentences.length - 1
    if (last >= 0 && ABBREVIATION_END.test(sentences[last])) sentences[last] = `${sentences[last]} ${piece}`
    else sentences.push(piece)
  }
  return sentences
}

/** text without the sentences that repeat one of the facts. */
export function withoutRepeatedFacts(text: string, facts: { figures: string[]; names: string[] }): string {
  return sentencesOf(text)
    .filter((sentence) => repeatedAnswerFacts(sentence, facts).length === 0)
    .join(' ')
}

const CLAIM_FILLER_WORDS = new Set(['a', 'an', 'and', 'around', 'at', 'by', 'for', 'from', 'i', 'in', 'my', 'of', 'on', 'or', 'over', 'per', 'the', 'to', 'using', 'with'])

function claimWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !CLAIM_FILLER_WORDS.has(word))
    .map((word) => (word.length > 3 ? word.replace(/s$/, '') : word))
}

/** A self reported "new claim" every word of which the candidate's own answer states. */
export function statedInAnswer(claim: string, answer: string): boolean {
  const answerWords = new Set(claimWords(answer))
  const words = claimWords(claim)
  // A claim with no words this can read ("€", another script) is never excused.
  return words.length > 0 && words.every((word) => answerWords.has(word))
}

export const FOLLOW_UP_REPEATED_ERROR = 'Follow up answer repeated outside its own line'

// Carries the repeated facts so the retry can be told exactly what to leave
// out. The message holds the candidate's words, so it is never logged.
export class FollowUpRepeatedError extends Error {
  readonly repeated: string[]
  constructor(repeated: string[]) {
    super(`${FOLLOW_UP_REPEATED_ERROR}: ${repeated.join(', ')}`)
    this.repeated = repeated
  }
}

/** Sent with the retry that follows a FollowUpRepeatedError, to the same model only. */
export function followUpRepeatedCorrection(repeated: string[]): string {
  const quoted = repeated.slice(0, 10).map((fact) => `"${fact.slice(0, 60)}"`).join(', ')
  return `Your previous draft repeated facts from the CANDIDATE-REPORTED section outside tailored_cv.follow_up_bullet: ${quoted}. Write every document again with those facts only in follow_up_bullet, and nowhere in the professional summary, any experience entry, cover_letter or recruiter_message.`
}

export function validateDocuments(raw: RawDocuments, scope: ValidationScope = VALIDATE_EVERYTHING): RawDocuments {
  const cv = raw.tailored_cv
  const letter = raw.cover_letter
  const message = raw.recruiter_message

  // The model self-reports any fact it introduced beyond the original CV
  // (new_claims_introduced, required by the schema). Rather than trusting the
  // "never invent a metric" prompt instructions alone, a non-empty report is
  // treated as a failed generation and retried — see generateDocuments' loop.
  // A claim the credited answer itself states is not new: it is the follow up
  // bullet's source, and where it may appear is checked separately below.
  const followUpSource = scope.followUpSource
  const newClaims = (Array.isArray(raw.new_claims_introduced)
    ? raw.new_claims_introduced.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
  ).filter((claim) => !followUpSource || !statedInAnswer(claim, followUpSource.answer))
  if (newClaims.length > 0) {
    throw new Error(`Model reported unverified claims not present in the original CV: ${JSON.stringify(newClaims)}`)
  }

  const sectionLabels: SectionLabels = {
    summary: (cv?.section_labels?.summary ?? '').trim() || 'Professional Summary',
    experience: (cv?.section_labels?.experience ?? '').trim() || 'Work Experience',
    education: (cv?.section_labels?.education ?? '').trim() || 'Education',
    languages: (cv?.section_labels?.languages ?? '').trim() || 'Languages',
  }

  // let, not const: a credited answer's facts may be removed from these below.
  let greeting = stripDashes((message?.greeting ?? '').trim())
  let messageBody = stripDashes((message?.body ?? '').trim())
  let closingLine = stripDashes((message?.closing_line ?? '').trim())
  const signOff = (message?.sign_off ?? '').trim() || 'Kind regards,'

  const fullName = (cv?.full_name ?? '').trim()
  const contactLine = (cv?.contact_line ?? '').trim()
  // Cap at 3 sentences regardless of what the model returns (the prompt asks
  // for exactly 3 via the Evidence, Strength, Employer Value framework, but
  // this guarantees it deterministically rather than trusting compliance).
  let professionalSummary = splitSentences(
    stripDashes((cv?.professional_summary ?? '').trim()),
  )
    .slice(0, 3)
    .join(' ')
  let experience = Array.isArray(cv?.experience) ? cv.experience : []
  const education = Array.isArray(cv?.education) ? cv.education : []

  let introParagraph = stripDashes((letter?.intro_paragraph ?? '').trim())
  let conclusionParagraph = stripDashes((letter?.conclusion_paragraph ?? '').trim())
  let thankYouLine = stripDashes((letter?.thank_you_line ?? '').trim())
  let bodyParagraphs = (Array.isArray(letter?.body_paragraphs) ? letter.body_paragraphs : [])
    .map((paragraph) => stripDashes(paragraph.trim()))
    .filter(Boolean)
  const salutation = (letter?.salutation ?? '').trim()
  const closingPhrase = (letter?.closing_phrase ?? '').trim() || 'Yours sincerely,'

  if (!fullName) throw new Error('Tailored CV is missing a name')
  if (!professionalSummary) throw new Error('Tailored CV is missing a professional summary')
  if (experience.length === 0) throw new Error('Tailored CV is missing experience')

  // Required, and retried when missing, only when a credited answer was sent;
  // otherwise dropped, so a bullet the model invents on its own is never printed.
  const followUpBullet = scope.followUpBullet ? stripDashes((cv?.follow_up_bullet ?? '').trim()) : ''
  if (scope.followUpBullet) {
    if (!followUpBullet) throw new Error('Tailored CV is missing the follow up bullet')
    if (containsPlaceholder(followUpBullet)) {
      throw new Error("Follow up bullet contains a placeholder instead of the candidate's own facts")
    }
  }
  // The answer's own figures and names belong in the follow up bullet alone.
  // 'reject' fails a draft that prints them anywhere else, so the next attempt,
  // told which facts, can rewrite it. 'remove' first drops the sentences and
  // bullets that repeat them, then checks the same way: only a repeat it cannot
  // remove (a job title, a date, an education line) or one that would empty the
  // summary or every body paragraph still fails the generation.
  let removedBodyParagraphs = 0
  let removedPlaceholderBullets = 0
  if (followUpSource) {
    const facts = answerOnlyFacts(followUpSource.answer, followUpSource.cvText, followUpSource)
    const repeats = (text: string) => repeatedAnswerFacts(text, facts).length > 0
    if (scope.followUpRepeats === 'remove') {
      const clean = (text: string) => withoutRepeatedFacts(text, facts)
      professionalSummary = clean(professionalSummary)
      if (!professionalSummary) throw new FollowUpRepeatedError(repeatedAnswerFacts(cv?.professional_summary ?? '', facts))
      // A placeholder bullet goes too: it would print the fact, flagged or not.
      experience = experience.map((entry) => {
        const bullets = Array.isArray(entry?.bullets) ? entry.bullets : []
        const kept = bullets.filter((bullet) => !repeats(stripDashes((bullet?.text ?? '').trim())))
        removedPlaceholderBullets +=
          bullets.filter((bullet) => bullet?.is_placeholder).length - kept.filter((bullet) => bullet?.is_placeholder).length
        return { ...entry, bullets: kept }
      })
      if (scope.coverLetter) {
        introParagraph = clean(introParagraph)
        conclusionParagraph = clean(conclusionParagraph)
        thankYouLine = clean(thankYouLine)
        const kept = bodyParagraphs.map(clean).filter(Boolean)
        if (kept.length === 0) throw new FollowUpRepeatedError(repeatedAnswerFacts(bodyParagraphs.join('\n'), facts))
        removedBodyParagraphs = bodyParagraphs.length - kept.length
        bodyParagraphs = kept
      }
      if (scope.recruiterMessage) {
        greeting = clean(greeting)
        messageBody = clean(messageBody)
        closingLine = clean(closingLine)
      }
    }
    // Everything printed apart from the follow up line: the same entry, bullet
    // and education caps, and dashes removed, as in the result below.
    const printed = [
      professionalSummary,
      ...experience.slice(0, MAX_EXPERIENCE_ENTRIES).flatMap((entry) => [
        stripDashes((entry?.title ?? '').trim()),
        (entry?.company_location ?? '').trim(),
        (entry?.dates ?? '').trim(),
        ...(Array.isArray(entry?.bullets) ? entry.bullets : [])
          .map((bullet) => stripDashes((bullet?.text ?? '').trim()))
          .filter(Boolean)
          .slice(0, MAX_BULLETS_PER_ENTRY),
      ]),
      ...education.slice(0, MAX_EDUCATION_ENTRIES).flatMap((entry) => [entry?.degree ?? '', entry?.institution ?? '', entry?.dates ?? '']),
      ...(Array.isArray(cv?.languages) ? cv.languages.map(String) : []),
      // Not the salutation or the letter's address line: they name the employer
      // and claim nothing about the candidate, and a city from the job ad there
      // must never fail a generation.
      ...(scope.coverLetter ? [introParagraph, ...bodyParagraphs, conclusionParagraph, thankYouLine] : []),
      ...(scope.recruiterMessage ? [greeting, messageBody, closingLine] : []),
    ].join('\n')
    const repeated = repeatedAnswerFacts(printed, facts)
    if (repeated.length > 0) throw new FollowUpRepeatedError(repeated)
  }
  if (scope.coverLetter) {
    if (!salutation) throw new Error('Cover letter is missing a salutation')
    if (!introParagraph) throw new Error('Cover letter is missing an introduction')
    // Counts what the model wrote: a paragraph removed above for repeating the answer still counts.
    if (bodyParagraphs.length + removedBodyParagraphs !== REQUIRED_BODY_PARAGRAPHS) {
      throw new Error('Cover letter must have exactly 3 body paragraphs')
    }
    if (!conclusionParagraph) throw new Error('Cover letter is missing a conclusion')
    if (!thankYouLine) throw new Error('Cover letter is missing a thank you line')
  }
  if (scope.recruiterMessage) {
    if (!greeting) throw new Error('Recruiter message is missing a greeting')
    if (messageBody.length < 20) throw new Error('Recruiter message output is too short')
    if (!closingLine) throw new Error('Recruiter message is missing a closing line')
  }

  // The letter must be written in the candidate's own first-person voice, not
  // a third-person recommendation about them — reject and retry if the model
  // slipped into naming the candidate anywhere in the letter body.
  const letterBody = `${introParagraph} ${bodyParagraphs.join(' ')} ${conclusionParagraph}`
  if (scope.coverLetter && containsName(letterBody, fullName)) {
    throw new Error('Cover letter is written in third person instead of first person')
  }
  if (scope.recruiterMessage && containsName(messageBody, fullName)) {
    throw new Error('Recruiter message is written in third person instead of first person')
  }

  // The recruiter message must stay qualitative, not cite statistics (the
  // prompt asks for this, but the model can still slip in a number).
  if (scope.recruiterMessage && /\d/.test(messageBody)) {
    throw new Error('Recruiter message contains a statistic instead of a qualitative reason')
  }

  // Only the documents that will be delivered are checked below.
  const deliveredText = [
    professionalSummary,
    ...(scope.coverLetter ? [introParagraph, ...bodyParagraphs, conclusionParagraph] : []),
    ...(scope.recruiterMessage ? [messageBody] : []),
  ].join(' ')

  // This app is English only — a job description or CV in another language
  // can still pull the model's output toward that language, so verify the
  // model actually complied rather than trusting the prompt instruction alone.
  // Language is a property of the whole response, so this reads every
  // document whatever the scope: a CV summary alone is too short for the
  // heuristic, and narrowing it would fail CV only requests more often.
  const combinedDocContent = [professionalSummary, followUpBullet, introParagraph, ...bodyParagraphs, conclusionParagraph, messageBody].join(' ')
  if (!looksLikeEnglish(combinedDocContent)) {
    throw new Error('Document content did not look like English')
  }

  // A "X%"/bracketed style placeholder is only ever legitimate inside a CV
  // experience bullet the model has explicitly disclosed as one via
  // is_placeholder (the sanctioned case-(C) bullet) — never in the summary,
  // cover letter, or recruiter message, which must stay submittable as is.
  //
  // Deliberately one directional: an unflagged bullet containing placeholder
  // vocabulary is still rejected (undisclosed leakage of example text), but
  // a flagged bullet is NOT required to contain that vocabulary. Not every
  // case-(C) area to improve is a missing fact/metric/credential — some ask
  // for a genuine attitude or framing statement (e.g. "express enjoyment in
  // this kind of work"), which has no natural bracketed placeholder and
  // shouldn't need one. is_placeholder itself (cross-checked against the
  // case-(C) count below, and rendered italic + under the page watermark)
  // is the disclosure mechanism; a rigid text-pattern requirement on top of
  // it only produced repeated real failures — confirmed live, twice — where
  // the model correctly flagged a bullet but couldn't force it into the
  // "X%"/bracket shape, exhausted all retries, and the user saw a 500.
  for (const entry of experience) {
    const rawBullets = Array.isArray(entry.bullets) ? entry.bullets : []
    for (const bullet of rawBullets) {
      const text = stripDashes((bullet?.text ?? '').trim())
      if (!text) continue
      const flagged = Boolean(bullet?.is_placeholder)
      if (!flagged && containsPlaceholder(text)) {
        throw new Error('CV bullet contains an unfilled example placeholder (e.g. "X%") without being marked as one')
      }
    }
  }

  // The model can silently skip the forced case-(C) placeholder bullet
  // without tripping any check above (nothing invalid was written, it just
  // omitted something) — this was a real gap: a case reported case-(C) with
  // no corresponding is_placeholder bullet anywhere on the CV, and shipped
  // clean. improvement_classifications is the model's own mechanical record
  // of its A/B/C/D decisions (required by the schema), so cross-check it
  // against what was actually produced and retry (via generateDocuments'
  // loop) if fewer placeholder bullets exist than case-(C) entries demand.
  const classifications = Array.isArray(raw.improvement_classifications) ? raw.improvement_classifications : []
  const caseCCount = classifications.filter((entry) => entry?.case === 'C').length
  const placeholderBulletCount = experience.reduce(
    (count, entry) =>
      count + (Array.isArray(entry.bullets) ? entry.bullets.filter((bullet) => bullet?.is_placeholder).length : 0),
    0,
  )
  // A placeholder bullet removed above for repeating a credited answer still counts.
  if (placeholderBulletCount + removedPlaceholderBullets < caseCCount) {
    throw new Error(
      `Model classified ${caseCCount} area(s) to improve as case C but only produced ${placeholderBulletCount} placeholder bullet(s)`,
    )
  }

  const placeholderCheckText = deliveredText
  if (containsPlaceholder(placeholderCheckText)) {
    throw new Error('Document contains an unfilled example placeholder (e.g. "X%") instead of real or omitted content')
  }

  return {
    new_claims_introduced: [],
    improvement_classifications: classifications,
    tailored_cv: {
      full_name: fullName,
      contact_line: contactLine,
      section_labels: sectionLabels,
      professional_summary: professionalSummary,
      experience: experience.slice(0, MAX_EXPERIENCE_ENTRIES).map((entry) => ({
        title: stripDashes((entry.title ?? '').trim()),
        company_location: (entry.company_location ?? '').trim(),
        dates: (entry.dates ?? '').trim(),
        bullets: (Array.isArray(entry.bullets) ? entry.bullets : [])
          .map((bullet) => ({
            text: stripDashes((bullet?.text ?? '').trim()),
            is_placeholder: Boolean(bullet?.is_placeholder),
          }))
          .filter((bullet) => bullet.text.length > 0)
          .slice(0, MAX_BULLETS_PER_ENTRY),
      })),
      education: education.slice(0, MAX_EDUCATION_ENTRIES).map((entry) => ({
        degree: (entry.degree ?? '').trim(),
        institution: (entry.institution ?? '').trim(),
        dates: (entry.dates ?? '').trim(),
      })),
      languages: (Array.isArray(cv.languages) ? cv.languages : [])
        .map((language) => language.trim())
        .filter(Boolean),
      follow_up_bullet: followUpBullet,
    },
    cover_letter: {
      company_location: (letter?.company_location ?? '').trim(),
      salutation,
      intro_paragraph: introParagraph,
      body_paragraphs: bodyParagraphs,
      conclusion_paragraph: conclusionParagraph,
      thank_you_line: thankYouLine,
      closing_phrase: closingPhrase,
    },
    recruiter_message: {
      greeting,
      body: messageBody,
      closing_line: closingLine,
      sign_off: signOff,
    },
  }
}

// ---------------------------------------------------------------------------
// PDF text safety
// ---------------------------------------------------------------------------

// pdf-lib's standard fonts (Helvetica) encode WinAnsi (Windows-1252) only and
// throw on anything else, so "Łukasz", "Şebnem" or an arrow in the model's
// output failed the whole request after the model had already been paid for.
// Embedding a Unicode font would need a new dependency; until then, text is
// brought into WinAnsi: accents WinAnsi lacks are dropped from their base
// letter, a few common symbols get plain equivalents, and anything left that
// cannot be encoded is removed.
const WINANSI_EXTRAS = new Set(
  Array.from('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'),
)

const PDF_REPLACEMENTS: Record<string, string> = {
  'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'Ħ': 'H', 'ħ': 'h', 'ı': 'i', 'Ŀ': 'L', 'ŀ': 'l',
  'Ŧ': 'T', 'ŧ': 't', 'ĸ': 'k', 'Ŋ': 'N', 'ŋ': 'n', 'Ə': 'E', 'ə': 'e',
  '→': '->', '←': '<-', '↔': '<->', '⇒': '=>', '≥': '>=', '≤': '<=', '≠': '!=',
  '−': '-', '‐': '-', '‑': '-', '‒': '-', '―': '-', '′': "'", '″': '"',
  '\u00a0': ' ', '\u2009': ' ', '\u202f': ' ', '\u200b': '',
}

function isWinAnsiEncodable(char: string): boolean {
  const code = char.codePointAt(0) ?? 0
  if (char === '\n' || char === '\r' || char === '\t') return true
  if (code >= 0x20 && code <= 0x7e) return true
  if (code >= 0xa1 && code <= 0xff) return true
  return WINANSI_EXTRAS.has(char)
}

export function toPdfSafeText(text: string): string {
  let out = ''
  for (const char of text) {
    if (isWinAnsiEncodable(char)) {
      out += char
      continue
    }
    if (char in PDF_REPLACEMENTS) {
      out += PDF_REPLACEMENTS[char]
      continue
    }
    const base = char.normalize('NFKD').replace(/\p{M}+/gu, '')
    if (base && Array.from(base).every(isWinAnsiEncodable)) {
      out += base
    }
    // Anything else (emoji, CJK, symbols) cannot be drawn and is dropped.
  }
  return out
}

/** Applies toPdfSafeText to every string in a value, keeping its shape. */
export function toPdfSafe<T>(value: T): T {
  if (typeof value === 'string') return toPdfSafeText(value) as T
  if (Array.isArray(value)) return value.map((item) => toPdfSafe(item)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toPdfSafe(item)])) as T
  }
  return value
}

// ---------------------------------------------------------------------------
// Failure reasons for logs
// ---------------------------------------------------------------------------

// Error messages from validation and from the model call can carry the
// candidate's details (the model's own list of claims, fragments of its
// output). Logs get a fixed reason code, never the message, the same rule
// analyze-check follows with classifyValidationFailure.
export function classifyGenerationError(message: string): string {
  // First: its message lists the candidate's own words, which could match a rule below.
  if (message.startsWith(FOLLOW_UP_REPEATED_ERROR)) return 'follow_up_repeated'
  if (message.startsWith('Model reported unverified claims')) return 'unverified_claims'
  const http = /^OpenAI API error: (\d{3})/.exec(message)
  if (http) return `openai_http_${http[1]}`
  if (message.includes('timed out')) return 'timeout'
  if (message.startsWith('Empty response')) return 'empty_response'
  if (message.includes('JSON')) return 'invalid_json'
  if (message.startsWith('Tailored CV')) return 'cv_incomplete'
  if (message.startsWith('Cover letter')) return 'cover_letter_invalid'
  if (message.startsWith('Recruiter message')) return 'recruiter_message_invalid'
  if (message.includes('placeholder')) return 'placeholder'
  if (message.includes('did not look like English')) return 'not_english'
  if (message.includes('WinAnsi')) return 'pdf_encoding'
  return 'other'
}

/** A model error worth retrying: timeouts, rate limits, server errors, bad output. */
export function isRetryableGenerationError(reason: string): boolean {
  const http = /^openai_http_(\d{3})$/.exec(reason)
  if (!http) return true
  const status = Number(http[1])
  return status === 408 || status === 409 || status === 429 || status >= 500
}
