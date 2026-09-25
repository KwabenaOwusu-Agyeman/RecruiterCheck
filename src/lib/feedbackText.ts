// Parsing for the stored feedback strings, shared by the Feedback page, the
// landing previews and the feedback bullet. Pure and DOM free so it can be
// unit tested with the tsx runner.
//
// Strengths and areas to improve are written server side as one string:
// a short finding/action, then evidence, then (for areas to improve) a
// trailing clause holding either "Sample wording: ..." (checks generated
// since the sample wording rules, a complete fictional CV bullet) or
// "Example: ..." (historical checks, a placeholder style illustration).
// Both generations are stored in the same jsonb column and must keep
// rendering, so this recognises both labels and reports which one it saw.

export const SAMPLE_WORDING_LABEL = 'Sample wording'

// Purely a display label. The stored marker text and every detection based
// on it (hasSampleWording below, the CLAUSE_PATTERN branch, the server's own
// SAMPLE_WORDING_LABEL in logic.ts) all still key off "Sample wording", so
// already-generated checks keep parsing correctly and the fictional notice
// keeps firing for the checks that need it. Only what the candidate reads
// changed, from "Sample wording" to "Example" — the same word the historical
// (pre prompt v6) clause already uses, so both generations now read the same.
export const SAMPLE_WORDING_DISPLAY_LABEL = 'Example'

// Shown once per Areas to Improve card, above the sample wording. Copy
// convention: no dashes anywhere in user facing text.
export const FICTIONAL_SAMPLE_NOTICE =
  'These are fictional examples, not claims about your experience. Use them to identify relevant evidence from your real experience, then replace them with your own details and results before adding anything to your CV.'

export interface SplitFinding {
  title: string
  evidence: string
  /** Historical "Example: ..." clause. Empty for new checks. */
  example: string
  /** New "Sample wording: ..." clause, unquoted. Empty for historical checks. */
  sampleWording: string
}

const CLAUSE_PATTERN = /^([\s\S]*?)\s*(Sample wording|Example):\s*([\s\S]*)$/
const DECIMAL_MARK = '@@DECIMAL@@'

function stripWrappingQuotes(value: string): string {
  return value.replace(/^["“”'‘’]+/, '').replace(/["“”'‘’]+$/, '').trim()
}

/**
 * Pulls the trailing sample wording or example clause out first, then splits
 * the remaining text on the first sentence boundary so the finding can render
 * bold, the evidence as normal text, and the clause as its own visually
 * separated line (the Tell -> Show structure). Decimal points (e.g. "7.2%")
 * are protected first so a stat never gets mistaken for a sentence break.
 */
export function splitFinding(text: string): SplitFinding {
  const protectedText = text.replace(/(\d)\.(\d)/g, `$1${DECIMAL_MARK}$2`)
  const restore = (value: string) => value.split(DECIMAL_MARK).join('.')

  const clauseMatch = protectedText.match(CLAUSE_PATTERN)
  const mainText = clauseMatch ? clauseMatch[1] : protectedText
  const clauseLabel = clauseMatch ? clauseMatch[2] : ''
  const clauseText = clauseMatch ? restore(clauseMatch[3].trim()) : ''

  const isSampleWording = clauseLabel === SAMPLE_WORDING_LABEL
  const example = isSampleWording ? '' : clauseText
  // The server stores sample wording unquoted and the UI adds the quotes, so
  // any quotes that did slip through are dropped rather than doubled.
  const sampleWording = isSampleWording ? stripWrappingQuotes(clauseText) : ''

  const match = mainText.match(/^([^.!?]+[.!?])\s*([\s\S]*)$/)
  if (!match) return { title: restore(mainText.trim()), evidence: '', example, sampleWording }
  return { title: restore(match[1].trim()), evidence: restore(match[2].trim()), example, sampleWording }
}

export function hasSampleWording(text: string): boolean {
  return splitFinding(text).sampleWording.length > 0
}

/**
 * Turns a finding's title into a clause that continues a sentence ("...but
 * show how you applied Python before you apply"): trailing punctuation off,
 * first letter lowered. Only an ordinary capitalised word is lowered. A first
 * word with a capital anywhere after its first letter is an acronym, a tool
 * or a product name (SQL, AWS, JavaScript, GitHub), and lowering it would
 * misspell it ("sQL"), so it is left exactly as written.
 */
export function lowerFirstClause(text: string): string {
  const trimmed = text.trim().replace(/[.!?]+$/, '')
  if (!trimmed) return trimmed
  const firstWord = trimmed.split(/\s/, 1)[0]
  if (/[A-Z]/.test(firstWord.slice(1))) return trimmed
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1)
}
