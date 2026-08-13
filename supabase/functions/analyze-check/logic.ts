// Pure, network-free logic split out of index.ts so it can be unit tested
// (via `npx tsx`/Deno test) without needing the OpenAI call or Deno runtime.

export type RequirementCategory = 'experience' | 'skills'
export type RequirementImportance = 'must_have' | 'important' | 'nice_to_have'
export type MatchStrength = 'strong' | 'partial' | 'none'
export type UvpEvidenceLevel = 'strong' | 'partial' | 'none'

export interface RawRequirement {
  requirement: string
  category: RequirementCategory
  importance: RequirementImportance
  critical: boolean
  match_strength: MatchStrength
  cv_evidence: string
}

export interface RawAnalysis {
  job_title: string
  company_name: string
  requirements: RawRequirement[]
  uvp_evidence_level: UvpEvidenceLevel
  uvp_evidence: string
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

const IMPORTANCE_WEIGHT: Record<RequirementImportance, number> = {
  must_have: 3,
  important: 2,
  nice_to_have: 1,
}

const MATCH_VALUE: Record<MatchStrength, number> = {
  strong: 1,
  partial: 0.5,
  none: 0,
}

const UVP_LEVEL_SCORE: Record<UvpEvidenceLevel, number> = {
  strong: 100,
  partial: 50,
  none: 0,
}

// No requirement was extracted for this category (e.g. a purely skills-led
// posting with nothing that reads as an experience requirement, or vice
// versa). There is nothing to divide by, and treating an empty category as
// either 0 or 100 would be an invented judgement the model never made — so
// this falls back to a documented neutral midpoint rather than a computed
// extreme.
const NEUTRAL_CATEGORY_FALLBACK = 50

/**
 * Deterministic category score: each requirement contributes its importance
 * weight (must_have=3, important=2, nice_to_have=1) multiplied by its match
 * value (strong=1, partial=0.5, none=0). The LLM only classifies and
 * matches; this function does all of the arithmetic.
 */
export function calculateCategoryScore(requirements: RawRequirement[], category: RequirementCategory): number {
  const filtered = requirements.filter((r) => r.category === category)
  if (filtered.length === 0) return NEUTRAL_CATEGORY_FALLBACK

  let matched = 0
  let max = 0
  for (const r of filtered) {
    const weight = IMPORTANCE_WEIGHT[r.importance]
    max += weight
    matched += weight * MATCH_VALUE[r.match_strength]
  }
  if (max === 0) return NEUTRAL_CATEGORY_FALLBACK

  return clampScore(Math.round((matched / max) * 100))
}

export function calculateUvpScore(level: UvpEvidenceLevel): number {
  return UVP_LEVEL_SCORE[level]
}

/**
 * A requirement missing a genuinely critical must-have (a licence, mandatory
 * registration, legal eligibility, etc — never a generic soft skill) caps
 * the final score below the "Needs Improvement" band regardless of how well
 * every other requirement matched, because that single gap can make the
 * candidate fundamentally ineligible. This never runs on a normal missing
 * must-have (critical=false) — that already pulls its category score down
 * through the weighting above, nothing more.
 */
const CRITICAL_GAP_CAP = 49

export function applyCriticalGapCap(score: number, requirements: RawRequirement[]): number {
  const hasCriticalGap = requirements.some(
    (r) => r.importance === 'must_have' && r.critical === true && r.match_strength === 'none',
  )
  return hasCriticalGap ? Math.min(score, CRITICAL_GAP_CAP) : score
}

// ---------------------------------------------------------------------------
// Evidence grounding
//
// Live validation of the previous, overlap-only design found a confirmed
// false positive: a fabricated "$10M annual revenue" claim passed because
// enough real, generic words (managed, enterprise, budgets, team,
// coordination...) rode along with it. Percentage-overlap alone cannot tell
// "this is the same fact in different words" apart from "this shares some
// vocabulary but invents a specific detail" — so it is no longer the primary
// check. The design below is source-anchoring first: an excerpt that is
// (after light normalization) literally present in the CV cannot, by
// construction, contain a fact the CV doesn't. Only when evidence is NOT a
// source-anchored excerpt does it fall through to explicit checks for
// invented numbers/money and invented named tools/qualifications — and it
// must clear BOTH before the old overlap heuristic is even consulted, now
// only as a narrow, last-resort sanity check that can no longer single
// handedly wave through a fabricated specific claim.
// ---------------------------------------------------------------------------

const STOPWORD_TOKENS = new Set([
  'that', 'this', 'with', 'from', 'have', 'been', 'were', 'their', 'they',
  'your', 'you', 'which', 'into', 'over', 'than', 'then', 'also', 'across',
  'role', 'years', 'year', 'about', 'when', 'where', 'while', 'during',
  'each', 'these', 'those', 'such', 'more', 'most', 'some', 'only', 'just',
])

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !STOPWORD_TOKENS.has(word))
}

// Loose enough to tolerate the punctuation/casing differences the brief
// explicitly asks for (a quote copied with a trailing period trimmed, or
// re-cased, still counts), strict enough that it is a genuine substring
// check, not a similarity score.
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%€$£.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Primary check: is this evidence an actual excerpt of the CV, not a
// generated paraphrase? A source anchored excerpt cannot introduce a fact
// that isn't in the CV, because it IS the CV's own text.
function isSourceAnchored(evidence: string, cvText: string): boolean {
  const normalizedEvidence = normalizeForMatch(evidence)
  if (!normalizedEvidence) return false
  return normalizeForMatch(cvText).includes(normalizedEvidence)
}

const CURRENCY_SUFFIX: Record<string, string> = {
  thousand: 'k', million: 'm', billion: 'b', k: 'k', m: 'm', b: 'b',
}

// Canonical, comparable forms for the quantified claims a piece of text
// makes, so "15 percent" and "15%" (or "€1.5 million" and "€1.5M") compare
// equal. Deliberately narrow — percentages and currency shorthand — rather
// than a general number parser.
export function extractQuantifiedClaims(text: string): Set<string> {
  const lower = text.toLowerCase()
  const claims = new Set<string>()

  for (const m of lower.matchAll(/(\d+(?:\.\d+)?)\s?(%|percent)/g)) {
    claims.add(`${m[1]}%`)
  }
  for (const m of lower.matchAll(/([€$£])\s?(\d+(?:\.\d+)?)\s?(k|m|b|thousand|million|billion)?/g)) {
    const suffix = m[3] ? CURRENCY_SUFFIX[m[3]] : ''
    claims.add(`${m[1]}${m[2]}${suffix}`)
  }
  return claims
}

// Catches spelled out amounts ("ten million dollars in annual revenue") that
// the digit based patterns above can't parse into a comparable value — this
// is the exact shape of the confirmed false positive from live validation.
// Blunt on purpose: if evidence uses any money/percentage language at all
// and the CV uses none anywhere, the evidence is presumed unsupported rather
// than attempting full numeric parsing of spelled out figures.
const FINANCIAL_LANGUAGE = /[$€£]|%|\bpercent\b|\bdollars?\b|\beuros?\b|\bpounds?\b|\brevenue\b|\bmillion\b|\bbillion\b|\bthousand\b/i

export function hasUnsupportedNumericClaim(evidence: string, cvText: string): boolean {
  const evidenceClaims = extractQuantifiedClaims(evidence)
  const cvClaims = extractQuantifiedClaims(cvText)
  for (const claim of evidenceClaims) {
    if (!cvClaims.has(claim)) return true
  }
  return FINANCIAL_LANGUAGE.test(evidence) && !FINANCIAL_LANGUAGE.test(cvText)
}

// A named tool, qualification, certification, language level, or similar
// proper noun introduced in evidence must actually appear in the CV.
// Acronyms (SAP, PMP, AWS, B2) are checked in any position; Title Case words
// are checked everywhere except the sentence-initial token, since a capital
// first letter is just English sentence casing, not evidence of a proper
// noun — but an acronym in that same position (e.g. "PMP certified...") is
// still checked, since acronyms don't get capitalized by sentence position.
export function extractNamedEntityCandidates(text: string): string[] {
  const tokens = [...text.matchAll(/[A-Za-z]+/g)].map((m) => m[0])
  const candidates: string[] = []
  tokens.forEach((token, index) => {
    if (/^[A-Z]{2,5}$/.test(token)) {
      candidates.push(token)
      return
    }
    if (index > 0 && /^[A-Z][a-z]{2,}$/.test(token)) {
      candidates.push(token)
    }
  })
  return candidates
}

export function hasUnsupportedNamedEntity(evidence: string, cvText: string): boolean {
  const cvLower = cvText.toLowerCase()
  return extractNamedEntityCandidates(evidence).some((candidate) => !cvLower.includes(candidate.toLowerCase()))
}

// Secondary heuristic only, reached solely when evidence is neither source
// anchored nor rejected by the specific-fact checks above — so a fabricated
// number, currency figure, or named tool can no longer independently ride
// through on shared generic vocabulary the way the previous overlap-only
// design allowed.
const FALLBACK_OVERLAP_THRESHOLD = 0.4

export function isGroundedInCv(evidence: string, cvText: string): boolean {
  const trimmed = evidence.trim()
  if (!trimmed) return true

  if (isSourceAnchored(trimmed, cvText)) return true

  if (hasUnsupportedNumericClaim(trimmed, cvText)) return false
  if (hasUnsupportedNamedEntity(trimmed, cvText)) return false

  const words = significantWords(trimmed)
  if (words.length === 0) return true
  const cvWords = new Set(significantWords(cvText))
  const matched = words.filter((word) => cvWords.has(word)).length
  return matched / words.length >= FALLBACK_OVERLAP_THRESHOLD
}

// A model that over-fragments a JD into many near identical requirements
// would otherwise silently distort the weighted category formula (each extra
// entry adds real weight). The prompt asks for roughly 6 to 12 requirements
// and forbids near duplicates, but nothing upstream enforces that — this is
// the deterministic backstop. Rather than reject the whole analysis (and
// burn a retry) for an over-eager but not malicious extraction, it keeps the
// highest-signal entries: must_have first, then important, then
// nice_to_have, preserving original order within each tier.
const MAX_REQUIREMENTS = 20

export function capRequirements(requirements: RawRequirement[]): RawRequirement[] {
  if (requirements.length <= MAX_REQUIREMENTS) return requirements
  const tierOrder: Record<RequirementImportance, number> = { must_have: 0, important: 1, nice_to_have: 2 }
  return [...requirements]
    .map((r, index) => ({ r, index }))
    .sort((a, b) => tierOrder[a.r.importance] - tierOrder[b.r.importance] || a.index - b.index)
    .slice(0, MAX_REQUIREMENTS)
    .map(({ r }) => r)
}

function isValidRequirement(value: unknown): value is RawRequirement {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return (
    typeof r.requirement === 'string' &&
    r.requirement.trim().length > 0 &&
    (r.category === 'experience' || r.category === 'skills') &&
    (r.importance === 'must_have' || r.importance === 'important' || r.importance === 'nice_to_have') &&
    typeof r.critical === 'boolean' &&
    (r.match_strength === 'strong' || r.match_strength === 'partial' || r.match_strength === 'none') &&
    typeof r.cv_evidence === 'string'
  )
}

const PRIVATE_IDENTIFIER_PATTERN = /\b(?:bsn|citizen service number|burgerservicenummer|passport number|identity card number|id number|residence permit number|work permit number|permit number|tax number|bank account|iban|date of birth|marital status|medical information|full home address)\b/i
const WORK_AUTH_PATTERN = /\b(?:work permit|work authori[sz]ation|authori[sz]ed to work|eligible to work|right to work|sponsorship)\b/i
const AVAILABILITY_PATTERN = /\b(?:availability|available|shift|shifts|weekend|weekends|evening|evenings|night|nights|daytime)\b/i
const EXPLICIT_MANDATORY_PATTERN = /\b(?:mandatory|required|must|essential)\b/i

type VerificationStage = 'cv' | 'application' | 'post_hire'

function verificationStage(requirement: RawRequirement): VerificationStage {
  if (PRIVATE_IDENTIFIER_PATTERN.test(requirement.requirement)) return 'post_hire'
  if (WORK_AUTH_PATTERN.test(requirement.requirement) || AVAILABILITY_PATTERN.test(requirement.requirement)) {
    return 'application'
  }
  return 'cv'
}

function makePrivacySafeImprovement(item: string): string | null {
  if (AVAILABILITY_PATTERN.test(item)) {
    return 'Confirm your availability. State your availability for the required shifts in the application form or recruiter message.'
  }
  if (PRIVATE_IDENTIFIER_PATTERN.test(item)) {
    if (!WORK_AUTH_PATTERN.test(item)) return null
    return 'Clarify work authorization. If accurate, add “Authorized to work in the Netherlands” to your professional summary or CV footer. Never include a BSN or permit number.'
  }
  return item
}

function requirementName(requirement: RawRequirement | undefined): string | null {
  if (!requirement) return null
  return requirement.requirement.trim().replace(/[.!?]+$/, '') || null
}

function buildScoreAwareProspects(score: number, requirements: RawRequirement[], improvements: string[]): string[] {
  const strongest = requirementName(requirements.find((item) => item.match_strength === 'strong'))
  const gap = requirementName(
    requirements.find((item) => item.match_strength === 'none' && item.importance === 'must_have') ??
      requirements.find((item) => item.match_strength === 'none') ??
      requirements.find((item) => item.match_strength === 'partial'),
  )

  if (score === 100) {
    return [
      'Your application shows complete documented alignment with this role.',
      'Your application is ready to submit, although employer decisions and competition still apply.',
    ]
  }
  if (score >= 85) {
    return [
      strongest
        ? `Your CV shows strong documented evidence for ${strongest}.`
        : 'Your CV shows strong documented alignment with this role.',
      improvements.length > 0
        ? 'Addressing the remaining refinement could further strengthen your interview chances.'
        : 'Your application is ready to submit, although employer decisions and competition still apply.',
    ]
  }
  if (score >= 61) {
    return [
      strongest
        ? `Your CV shows relevant evidence for ${strongest}, but important gaps still need attention.`
        : 'Your CV shows relevant alignment, but important gaps still need attention.',
      gap
        ? `Strengthen or confirm your evidence for ${gap} before applying.`
        : 'Address the areas above before applying to improve your interview chances.',
    ]
  }
  return [
    gap
      ? `Your CV does not yet show enough evidence for ${gap}, which is important for this role.`
      : 'Your CV does not yet show enough evidence for this specific role.',
    'Focus on the essential missing requirements before applying or target a more closely aligned role.',
  ]
}

export function normalizeAnalysis(raw: RawAnalysis, cvText: string): AnalysisResult {
  const strengths = [
    combineFinding(raw.strength_1_finding, raw.strength_1_evidence),
    combineFinding(raw.strength_2_finding, raw.strength_2_evidence),
  ].filter((item): item is string => item !== null)
  const generatedImprovements = [
    combineFinding(raw.improvement_1_finding, raw.improvement_1_evidence, raw.improvement_1_example),
    combineFinding(raw.improvement_2_finding, raw.improvement_2_evidence, raw.improvement_2_example),
    combineFinding(raw.improvement_3_finding, raw.improvement_3_evidence, raw.improvement_3_example),
  ]
    .filter((item): item is string => item !== null)
    .map(makePrivacySafeImprovement)
    .filter((item): item is string => item !== null)
  const prospects = sanitizeStrings([raw.prospect_1, raw.prospect_2])

  if (strengths.length > 2) throw new Error('Expected at most 2 strengths')
  if (generatedImprovements.length > 3) throw new Error('Expected at most 3 areas to improve')
  if (prospects.length > 2) throw new Error('Expected at most 2 prospects')

  const combinedContent = [...strengths, ...generatedImprovements, ...prospects].join(' ')
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

  if (!Array.isArray(raw.requirements) || raw.requirements.length === 0) {
    throw new Error('Expected a non empty requirement matrix')
  }
  if (!raw.requirements.every(isValidRequirement)) {
    throw new Error('Requirement matrix contains an invalid entry')
  }

  if (
    raw.uvp_evidence_level !== 'strong' &&
    raw.uvp_evidence_level !== 'partial' &&
    raw.uvp_evidence_level !== 'none'
  ) {
    throw new Error('Missing or invalid uvp_evidence_level')
  }
  // Never let one disputed evidence match prevent the user from receiving
  // feedback. A strong or partial classification only earns credit when its
  // evidence is verifiably grounded in the CV. Otherwise downgrade it to
  // none and clear the unsupported evidence, then continue conservatively.
  const evidenceSafeRequirements = raw.requirements
    .filter((requirement) => verificationStage(requirement) !== 'post_hire')
    .map((requirement) => {
    const claimsMatch = requirement.match_strength === 'strong' || requirement.match_strength === 'partial'
    const availabilityCanBeCritical = requirement.importance === 'must_have' && EXPLICIT_MANDATORY_PATTERN.test(requirement.requirement)
    const safeCritical = AVAILABILITY_PATTERN.test(requirement.requirement)
      ? requirement.critical && availabilityCanBeCritical
      : requirement.critical
    if (claimsMatch && !isGroundedInCv(requirement.cv_evidence, cvText)) {
      return { ...requirement, critical: safeCritical, match_strength: 'none' as const, cv_evidence: '' }
    }
    return requirement.match_strength === 'none'
      ? { ...requirement, critical: safeCritical, cv_evidence: '' }
      : { ...requirement, critical: safeCritical }
    })
  const evidenceSafeUvpLevel = raw.uvp_evidence_level !== 'none' && isGroundedInCv(raw.uvp_evidence, cvText)
    ? raw.uvp_evidence_level
    : 'none'

  // Deduplicate exact-text duplicate requirements (case/whitespace
  // insensitive) as a safety net against a model that restates the same
  // requirement twice — the prompt also asks it not to, but this keeps the
  // arithmetic correct even if it slips. Genuine semantic near-duplicates
  // (different wording, same underlying requirement) are the prompt's
  // responsibility, not something this can reliably detect.
  const seen = new Set<string>()
  const dedupedRequirements = capRequirements(
    evidenceSafeRequirements.filter((r) => {
      const key = `${r.category}::${r.requirement.trim().toLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }),
  )

  const experienceScore = calculateCategoryScore(dedupedRequirements, 'experience')
  const skillsScore = calculateCategoryScore(dedupedRequirements, 'skills')
  const uvpScore = calculateUvpScore(evidenceSafeUvpLevel)

  const weighted = 0.4 * experienceScore + 0.35 * skillsScore + 0.25 * uvpScore
  const finalScore = applyCriticalGapCap(clampScore(Math.round(weighted)), dedupedRequirements)
  const improvementLimit = finalScore === 100 ? 0 : finalScore >= 85 ? 1 : 3
  const improvements = generatedImprovements.slice(0, improvementLimit)
  const scoreAwareProspects = buildScoreAwareProspects(finalScore, dedupedRequirements, improvements)

  return {
    interview_probability_score: finalScore,
    experience_score: experienceScore,
    skills_score: skillsScore,
    uvp_score: uvpScore,
    strengths,
    improvements,
    prospects: scoreAwareProspects,
    detected_language: 'en',
    job_title: typeof raw.job_title === 'string' && raw.job_title.trim() ? raw.job_title.trim() : null,
    company_name: typeof raw.company_name === 'string' && raw.company_name.trim() ? raw.company_name.trim() : null,
  }
}
