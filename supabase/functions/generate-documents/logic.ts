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

export function validateDocuments(raw: RawDocuments): RawDocuments {
  const cv = raw.tailored_cv
  const letter = raw.cover_letter
  const message = raw.recruiter_message

  // The model self-reports any fact it introduced beyond the original CV
  // (new_claims_introduced, required by the schema). Rather than trusting the
  // "never invent a metric" prompt instructions alone, a non-empty report is
  // treated as a failed generation and retried — see generateDocuments' loop.
  const newClaims = Array.isArray(raw.new_claims_introduced)
    ? raw.new_claims_introduced.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
  if (newClaims.length > 0) {
    throw new Error(`Model reported unverified claims not present in the original CV: ${JSON.stringify(newClaims)}`)
  }

  const sectionLabels: SectionLabels = {
    summary: (cv?.section_labels?.summary ?? '').trim() || 'Professional Summary',
    experience: (cv?.section_labels?.experience ?? '').trim() || 'Work Experience',
    education: (cv?.section_labels?.education ?? '').trim() || 'Education',
    languages: (cv?.section_labels?.languages ?? '').trim() || 'Languages',
  }

  const greeting = stripDashes((message?.greeting ?? '').trim())
  const messageBody = stripDashes((message?.body ?? '').trim())
  const closingLine = stripDashes((message?.closing_line ?? '').trim())
  const signOff = (message?.sign_off ?? '').trim() || 'Kind regards,'

  const fullName = (cv?.full_name ?? '').trim()
  const contactLine = (cv?.contact_line ?? '').trim()
  // Cap at 3 sentences regardless of what the model returns (the prompt asks
  // for exactly 3 via the Evidence, Strength, Employer Value framework, but
  // this guarantees it deterministically rather than trusting compliance).
  const professionalSummary = splitSentences(
    stripDashes((cv?.professional_summary ?? '').trim()),
  )
    .slice(0, 3)
    .join(' ')
  const experience = Array.isArray(cv?.experience) ? cv.experience : []
  const education = Array.isArray(cv?.education) ? cv.education : []

  const introParagraph = stripDashes((letter?.intro_paragraph ?? '').trim())
  const conclusionParagraph = stripDashes((letter?.conclusion_paragraph ?? '').trim())
  const thankYouLine = stripDashes((letter?.thank_you_line ?? '').trim())
  const bodyParagraphs = (Array.isArray(letter?.body_paragraphs) ? letter.body_paragraphs : [])
    .map((paragraph) => stripDashes(paragraph.trim()))
    .filter(Boolean)
  const salutation = (letter?.salutation ?? '').trim()
  const closingPhrase = (letter?.closing_phrase ?? '').trim() || 'Yours sincerely,'

  if (!fullName) throw new Error('Tailored CV is missing a name')
  if (!professionalSummary) throw new Error('Tailored CV is missing a professional summary')
  if (experience.length === 0) throw new Error('Tailored CV is missing experience')
  if (!salutation) throw new Error('Cover letter is missing a salutation')
  if (!introParagraph) throw new Error('Cover letter is missing an introduction')
  if (bodyParagraphs.length !== REQUIRED_BODY_PARAGRAPHS) {
    throw new Error('Cover letter must have exactly 3 body paragraphs')
  }
  if (!conclusionParagraph) throw new Error('Cover letter is missing a conclusion')
  if (!thankYouLine) throw new Error('Cover letter is missing a thank you line')
  if (!greeting) throw new Error('Recruiter message is missing a greeting')
  if (messageBody.length < 20) throw new Error('Recruiter message output is too short')
  if (!closingLine) throw new Error('Recruiter message is missing a closing line')

  // The letter must be written in the candidate's own first-person voice, not
  // a third-person recommendation about them — reject and retry if the model
  // slipped into naming the candidate anywhere in the letter body.
  const letterBody = `${introParagraph} ${bodyParagraphs.join(' ')} ${conclusionParagraph}`
  if (containsName(letterBody, fullName)) {
    throw new Error('Cover letter is written in third person instead of first person')
  }
  if (containsName(messageBody, fullName)) {
    throw new Error('Recruiter message is written in third person instead of first person')
  }

  // The recruiter message must stay qualitative, not cite statistics (the
  // prompt asks for this, but the model can still slip in a number).
  if (/\d/.test(messageBody)) {
    throw new Error('Recruiter message contains a statistic instead of a qualitative reason')
  }

  // This app is English only — a job description or CV in another language
  // can still pull the model's output toward that language, so verify the
  // model actually complied rather than trusting the prompt instruction alone.
  const combinedDocContent = [professionalSummary, introParagraph, ...bodyParagraphs, conclusionParagraph, messageBody].join(' ')
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
  if (placeholderBulletCount < caseCCount) {
    throw new Error(
      `Model classified ${caseCCount} area(s) to improve as case C but only produced ${placeholderBulletCount} placeholder bullet(s)`,
    )
  }

  const placeholderCheckText = [professionalSummary, introParagraph, ...bodyParagraphs, conclusionParagraph, messageBody].join(' ')
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
