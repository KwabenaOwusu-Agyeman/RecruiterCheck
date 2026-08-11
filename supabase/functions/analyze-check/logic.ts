// Pure, network-free logic split out of index.ts so it can be unit tested
// (via `npx tsx`/Deno test) without needing the OpenAI call or Deno runtime.

export interface RawAnalysis {
  job_title: string
  company_name: string
  experience_score: number
  skills_score: number
  uvp_score: number
  strength_1_finding: string
  strength_1_evidence: string
  strength_2_finding: string
  strength_2_evidence: string
  improvement_1_finding: string
  improvement_1_evidence: string
  improvement_1_example: string
  improvement_2_finding: string
  improvement_2_evidence: string
  improvement_2_example: string
  improvement_3_finding: string
  improvement_3_evidence: string
  improvement_3_example: string
  prospect_1: string
  prospect_2: string
  new_claims_introduced: string[]
}

export interface AnalysisResult {
  interview_probability_score: number
  experience_score: number
  skills_score: number
  uvp_score: number
  strengths: string[]
  improvements: string[]
  prospects: string[]
  detected_language: string
  job_title: string | null
  company_name: string | null
}

// This app is English only — every check must produce English output
// regardless of the job description's or CV's own language. This checks that
// the model actually complied, since prompt instructions alone aren't fully
// reliable (a job description or CV in another language can still pull the
// model's output toward that language).
export const ENGLISH_TELLS = [' the ', ' and ', ' your ', ' that ', ' with ', ' this ', ' for ', ' you ', ' are ', ' have ']

export function looksLikeEnglish(text: string): boolean {
  const padded = ` ${text.toLowerCase()} `
  return ENGLISH_TELLS.filter((tell) => padded.includes(tell)).length >= 5
}

export function sanitizeStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => stripDashes(item.trim()))
    .filter((item) => item.length > 0)
}

/**
 * Strengths and areas to improve arrive as separate finding/evidence(/example)
 * schema fields (so the model can't skip the evidence half — see the JSON
 * schema's required list) and get joined back into a single
 * "Finding. Evidence. Example: ..." string here, which is what the Feedback
 * page's splitFinding() expects in order to bold the finding and render the
 * rest (evidence and, when present, the example) as plain text.
 */
export function combineFinding(finding: unknown, evidence: unknown, example?: unknown): string | null {
  if (typeof finding !== 'string' || typeof evidence !== 'string') return null

  const cleanFinding = stripDashes(finding.trim()).replace(/[.!?]+$/, '')
  const cleanEvidence = stripDashes(evidence.trim())
  if (!cleanFinding || !cleanEvidence) return null

  const cleanExample = typeof example === 'string' ? stripDashes(example.trim()) : ''
  const evidenceSentence = cleanEvidence.match(/[.!?]$/) ? cleanEvidence : `${cleanEvidence}.`

  return cleanExample
    ? `${cleanFinding}. ${evidenceSentence} Example: ${cleanExample}`
    : `${cleanFinding}. ${cleanEvidence}`
}

/**
 * The "never use hyphens" prompt rule isn't reliable on its own (gpt-4o-mini
 * still slips into compounds like "data-driven"), so this mirrors the
 * deterministic sanitizer used in generate-documents rather than relying on
 * prompt wording alone.
 */
export function stripDashes(text: string): string {
  return text
    .replace(/(\w)[-–—](?=\w)/g, '$1 ')
    .replace(/\s*[-–—]\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/ ,/g, ',')
    .trim()
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value))
}

export function normalizeAnalysis(raw: RawAnalysis): AnalysisResult {
  const strengths = [
    combineFinding(raw.strength_1_finding, raw.strength_1_evidence),
    combineFinding(raw.strength_2_finding, raw.strength_2_evidence),
  ].filter((item): item is string => item !== null)
  const improvements = [
    combineFinding(raw.improvement_1_finding, raw.improvement_1_evidence, raw.improvement_1_example),
    combineFinding(raw.improvement_2_finding, raw.improvement_2_evidence, raw.improvement_2_example),
    combineFinding(raw.improvement_3_finding, raw.improvement_3_evidence, raw.improvement_3_example),
  ].filter((item): item is string => item !== null)
  const prospects = sanitizeStrings([raw.prospect_1, raw.prospect_2])

  if (strengths.length !== 2) throw new Error('Expected exactly 2 strengths')
  if (improvements.length !== 3) throw new Error('Expected exactly 3 areas to improve')
  if (prospects.length !== 2) throw new Error('Expected exactly 2 prospects')

  const combinedContent = [...strengths, ...improvements, ...prospects].join(' ')
  if (!looksLikeEnglish(combinedContent)) {
    throw new Error('Content did not look like English')
  }

  // The model self-reports any candidate fact it introduced beyond the
  // original CV (new_claims_introduced, required by the schema). A non-empty
  // report is treated as a failed generation and retried, rather than
  // trusting the "do not invent" prompt instructions alone.
  const newClaims = Array.isArray(raw.new_claims_introduced)
    ? raw.new_claims_introduced.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
  if (newClaims.length > 0) {
    throw new Error(`Model reported unverified claims not present in the original CV: ${JSON.stringify(newClaims)}`)
  }

  if (
    !isFiniteNumber(raw.experience_score) ||
    !isFiniteNumber(raw.skills_score) ||
    !isFiniteNumber(raw.uvp_score)
  ) {
    throw new Error('Missing or invalid scores')
  }

  const experienceScore = clampScore(raw.experience_score)
  const skillsScore = clampScore(raw.skills_score)
  const uvpScore = clampScore(raw.uvp_score)
  const weighted = 0.4 * experienceScore + 0.35 * skillsScore + 0.25 * uvpScore

  return {
    interview_probability_score: Math.round(weighted),
    experience_score: experienceScore,
    skills_score: skillsScore,
    uvp_score: uvpScore,
    strengths,
    improvements,
    prospects,
    detected_language: 'en',
    job_title: typeof raw.job_title === 'string' && raw.job_title.trim() ? raw.job_title.trim() : null,
    company_name: typeof raw.company_name === 'string' && raw.company_name.trim() ? raw.company_name.trim() : null,
  }
}
