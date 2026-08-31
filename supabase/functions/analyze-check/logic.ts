// Pure, network-free logic split out of index.ts so it can be unit tested
// (via `npx tsx`/Deno test) without needing the OpenAI call or Deno runtime.

// A material change to what the rubric measures or how it weights evidence
// must bump this to a new version string, never silently redefine what an
// existing version means — old stored breakdowns stay interpretable against
// the version they were actually computed under.
export const RUBRIC_VERSION = 'early_career_tech_v1'
// Bump whenever the system prompt's scoring-relevant instructions change
// (new/removed subcriteria, changed grounding rules, changed fairness
// guidance) — cosmetic wording fixes that don't change what's measured
// don't need a bump.
export const PROMPT_VERSION = 'analyze-check-prompt-v5'

/**
 * Generic, network-free retry wrapper: try `attempt` up to `maxAttempts`
 * times, returning the first success. If every attempt fails, throws a
 * single error aggregating every attempt's failure message — the caller
 * (analyze-check/index.ts) treats that as "fail safely": mark the check
 * failed, save no feedback, complete no score, consume no credit. Kept
 * here (not in index.ts) specifically so it can be unit tested without a
 * Deno runtime or a real OpenAI call — the caller supplies `attempt` as a
 * closure over whatever it actually wants retried.
 */
// `attempt` receives the previous failure's message (null on the first
// call) so the caller can build a correction prompt from it — e.g. telling
// the model exactly what validation rejected about its last response,
// using the same candidate inputs, rather than blindly repeating the exact
// same request and hoping for a different result.
export async function withRetry<T>(
  attempt: (previousError: string | null) => Promise<T>,
  maxAttempts: number,
): Promise<T> {
  const errors: string[] = []
  let previousError: string | null = null
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      return await attempt(previousError)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(message)
      previousError = message
    }
  }
  throw new Error(`All ${maxAttempts} attempts failed: ${JSON.stringify(errors)}`)
}

export type RequirementCategory = 'experience' | 'skills'
export type RequirementImportance = 'must_have' | 'important' | 'nice_to_have'
export type MatchStrength = 'strong' | 'partial' | 'none'
// Shared three-level classification used for every holistic (non
// requirement-matrix) judgment the model makes: the UVP level, and every
// scorecard subcriterion added below. Kept as one type (with UvpEvidenceLevel
// as an alias) so a single scoring/grounding helper can serve all of them.
export type EvidenceLevel = 'strong' | 'partial' | 'none'
export type UvpEvidenceLevel = EvidenceLevel

// Where in the CV a piece of evidence actually comes from. 'skills' and
// 'summary' are "listed, not demonstrated" locations — a fact that lives only
// there is a claim of familiarity, never proof the candidate actually did
// anything with it. There is no 'none' section: a "none" classification is
// represented by a null reference (see EvidenceReference below), not an
// object with a placeholder section.
export type CvSection =
  | 'experience'
  | 'projects'
  | 'education'
  | 'certifications'
  | 'volunteering'
  | 'skills'
  | 'summary'
  | 'other'

const DEMONSTRATING_SECTIONS = new Set<CvSection>([
  'experience', 'projects', 'education', 'certifications', 'volunteering', 'other',
])
// Sections where evidence is claimed but not shown in use — a bare mention
// here can never independently support a "strong" evidence-dependent rating,
// and for most evidence-dependent subcriteria (see
// EVIDENCE_DEPENDENT_FIELD_CONFIG below) can't support "partial" either.
const NON_DEMONSTRATING_SECTIONS = new Set<CvSection>(['skills', 'summary'])

// What kind of activity the evidence entry actually is — mirrors the
// "employment or otherwise" fairness principle used throughout this rubric:
// personal, academic, and volunteer work are first class evidence, not a
// consolation category.
export type EvidenceType =
  | 'employment'
  | 'project'
  | 'internship'
  | 'apprenticeship'
  | 'academic'
  | 'freelance'
  | 'research'
  | 'volunteer'
  | 'other'
  | 'none'

const CV_SECTIONS: ReadonlySet<string> = new Set<CvSection>([
  'experience', 'projects', 'education', 'certifications', 'volunteering', 'skills', 'summary', 'other',
])
// 'other' covers a genuine, demonstrating activity that doesn't fit the
// eight named types (e.g. an extracurricular club role with a real,
// describable contribution) — live testing found the model otherwise
// reaching for evidence_type "none" on this kind of entry, which is only
// valid for the tools_platforms listed-partial exception or an actual
// "none" level, causing a real (non-listed-only) activity to be rejected
// outright rather than credited at whatever level it genuinely earns.
const EVIDENCE_TYPES: ReadonlySet<string> = new Set<EvidenceType>([
  'employment', 'project', 'internship', 'apprenticeship', 'academic', 'freelance', 'research', 'volunteer', 'other', 'none',
])

/**
 * A structured pointer to where a "strong"/"partial" evidence-dependent
 * classification actually comes from in the CV — required specifically so a
 * downstream deterministic check (not just prompt wording) can tell "the
 * model quoted a skills list" apart from "the model quoted a real project."
 * entry_reference and evidence_basis are short labels/paraphrases, never a
 * full verbatim quotation — the existing `_evidence` excerpt fields already
 * carry the word for word, source anchored text used for anti hallucination
 * grounding; this is a separate, human readable "where did this come from"
 * pointer suitable for the audit record.
 */
export interface EvidenceReference {
  cv_section: CvSection
  entry_reference: string
  evidence_basis: string
  evidence_type: EvidenceType
}

export function isValidCvSection(value: unknown): value is CvSection {
  return typeof value === 'string' && CV_SECTIONS.has(value)
}

export function isValidEvidenceType(value: unknown): value is EvidenceType {
  return typeof value === 'string' && EVIDENCE_TYPES.has(value)
}

// A "short paraphrase" that runs this long is functionally a CV quotation
// wearing a paraphrase's clothing — reject it the same as any other invalid
// reference rather than trust the prompt's wording alone.
const MAX_EVIDENCE_BASIS_CHARS = 160

export function isValidEvidenceReference(value: unknown): value is EvidenceReference {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return (
    isValidCvSection(r.cv_section) &&
    typeof r.entry_reference === 'string' &&
    typeof r.evidence_basis === 'string' &&
    r.evidence_basis.length <= MAX_EVIDENCE_BASIS_CHARS &&
    isValidEvidenceType(r.evidence_type)
  )
}

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
  // -- Scorecard subcriteria (see SCORE_WEIGHTS below for the point values
  // each one carries). Every level below is a holistic judgment the model
  // makes about the CV as a whole, distinct from the per-requirement
  // extraction in `requirements` above. Each evidence-bearing level has a
  // matching `_evidence` excerpt so it can be grounding-checked the same way
  // `cv_evidence`/`uvp_evidence` already are; `cv_structure_level` has none
  // since CV structure is a formatting judgment, not a factual claim that
  // could be fabricated.
  applied_evidence_level: EvidenceLevel
  applied_evidence: string
  applied_evidence_reference: EvidenceReference | null
  applied_skill_evidence_level: EvidenceLevel
  applied_skill_evidence: string
  applied_skill_reference: EvidenceReference | null
  results_evidence_level: EvidenceLevel
  results_evidence: string
  results_reference: EvidenceReference | null
  skill_application_evidence_level: EvidenceLevel
  skill_application_evidence: string
  skill_application_reference: EvidenceReference | null
  tools_platforms_evidence_level: EvidenceLevel
  tools_platforms_evidence: string
  tools_platforms_reference: EvidenceReference | null
  certifications_evidence_level: EvidenceLevel
  certifications_evidence: string
  role_fit_evidence_level: EvidenceLevel
  role_fit_evidence: string
  technical_communication_level: EvidenceLevel
  technical_communication_evidence: string
  cv_structure_level: EvidenceLevel
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

// One entry per rubric subcriterion. `level` is present for every holistic
// strong/partial/none judgment; the one exception is essential_skills,
// which is a continuous requirement-match percentage rather than a single
// AI-classified level, so its `level` is a display bucket derived from that
// percentage, not something the model returned directly (see
// deriveDisplayLevel below). `reason` is always a short, static,
// template-derived sentence — never a CV or job description excerpt.
export interface ScoreBreakdownSubcriterion {
  level?: EvidenceLevel
  points: number
  max: number
  reason: string
}

export interface ScoreBreakdownCategory {
  subtotal: number
  max_points: number
  subcriteria: Record<string, ScoreBreakdownSubcriterion>
}

// A literal, not a union: this codebase only ever produces one kind of
// breakdown, generated from an explicit, validated AI evaluation. It exists
// as an explicit field (rather than being implied by the presence of the
// object) so that if a different scoring method is ever introduced, old
// stored breakdowns remain unambiguous about which method produced them —
// and, critically, so a legacy/failed check's `score_breakdown: null` can
// never be confused with, or silently upgraded into, a "detailed_rubric"
// result it never actually earned.
export type ScoringMethod = 'detailed_rubric'

export interface ScoreBreakdown {
  scoring_method: ScoringMethod
  rubric_version: string
  prompt_version: string
  model: string | null
  calculated_at: string
  categories: {
    relevant_evidence_and_applied_ability: ScoreBreakdownCategory
    technical_and_role_specific_capability: ScoreBreakdownCategory
    role_fit_and_recruiter_communication: ScoreBreakdownCategory
  }
  // The 0-100 weighted blend of the three category subtotals, before the
  // critical-gap cap is applied — kept distinct from final_score so a
  // capped check still shows what the uncapped evidence would have earned.
  raw_weighted_score: number
  critical_gap_capped: boolean
  final_score: number
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
  score_breakdown: ScoreBreakdown
  // The structured "where did this come from" pointer for each evidence
  // dependent subcriterion (see EvidenceReference above), keyed by
  // subcriterion name. Persisted alongside the score breakdown so a human
  // reviewing check_score_audits can see why a rating was granted without
  // ever storing a full CV quotation.
  evidence_references: Record<string, EvidenceReference | null>
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

const EVIDENCE_LEVEL_SCORE: Record<EvidenceLevel, number> = {
  strong: 100,
  partial: 50,
  none: 0,
}

// Shared conversion for every holistic strong/partial/none judgment (UVP and
// every scorecard subcriterion below) into the same 0/50/100 scale that
// calculateCategoryScore's requirement matching already produces, so all of
// them combine on equal footing.
export function levelScore(level: EvidenceLevel): number {
  return EVIDENCE_LEVEL_SCORE[level]
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
  return levelScore(level)
}

// Point weights for the expanded scorecard (see the README-style breakdown
// in the product spec this implements). Each group's weights sum to that
// category's total (40 / 35 / 25), and the three category totals are
// combined with the same 0.4 / 0.35 / 0.25 weights the app has always used —
// only the internal composition of each category got more granular.
export const CATEGORY_1_POINTS = { appliedEvidence: 20, appliedSkill: 10, results: 10 } // 40
export const CATEGORY_2_POINTS = { essentialSkills: 15, skillApplication: 10, tools: 5, certifications: 5 } // 35
export const CATEGORY_3_POINTS = { roleFit: 10, valueProposition: 5, technicalCommunication: 5, cvStructure: 5 } // 25

/**
 * Category 1, "Relevant evidence and applied ability": a weighted blend of
 * three holistic levels the model classifies (relevant applied work —
 * employment or otherwise, see applied_evidence_level in RawAnalysis —
 * applied skills, results/deliverables) — deliberately not derived from the
 * requirement matrix, since this category exists specifically to credit
 * personal, academic, bootcamp, freelance, and volunteer work on equal
 * footing with paid employment, which a JD-requirement match would not
 * capture for a candidate with no formal experience.
 */
export function calculateEvidenceAbilityScore(levels: {
  appliedEvidence: EvidenceLevel
  appliedSkill: EvidenceLevel
  results: EvidenceLevel
}): number {
  const { appliedEvidence, appliedSkill, results } = CATEGORY_1_POINTS
  const total = appliedEvidence + appliedSkill + results
  const weighted =
    appliedEvidence * levelScore(levels.appliedEvidence) +
    appliedSkill * levelScore(levels.appliedSkill) +
    results * levelScore(levels.results)
  return clampScore(Math.round(weighted / total))
}

/**
 * Category 2, "Technical and role specific capability": the essential
 * skills subcriterion reuses the existing requirement-matrix match against
 * 'skills' category requirements (unchanged mechanism); the other three are
 * holistic levels the model classifies directly.
 */
export function calculateCapabilityScore(
  requirements: RawRequirement[],
  levels: { skillApplication: EvidenceLevel; tools: EvidenceLevel; certifications: EvidenceLevel },
): number {
  const { essentialSkills, skillApplication, tools, certifications } = CATEGORY_2_POINTS
  const total = essentialSkills + skillApplication + tools + certifications
  const essentialSkillsScore = calculateCategoryScore(requirements, 'skills')
  const weighted =
    essentialSkills * essentialSkillsScore +
    skillApplication * levelScore(levels.skillApplication) +
    tools * levelScore(levels.tools) +
    certifications * levelScore(levels.certifications)
  return clampScore(Math.round(weighted / total))
}

/**
 * Category 3, "Role fit and recruiter communication": all four
 * subcriteria are holistic levels, including the pre-existing UVP
 * ("evidence based value proposition") slot, which keeps its own field name
 * and grounding path unchanged.
 */
export function calculateFitCommunicationScore(levels: {
  roleFit: EvidenceLevel
  valueProposition: EvidenceLevel
  technicalCommunication: EvidenceLevel
  cvStructure: EvidenceLevel
}): number {
  const { roleFit, valueProposition, technicalCommunication, cvStructure } = CATEGORY_3_POINTS
  const total = roleFit + valueProposition + technicalCommunication + cvStructure
  const weighted =
    roleFit * levelScore(levels.roleFit) +
    valueProposition * levelScore(levels.valueProposition) +
    technicalCommunication * levelScore(levels.technicalCommunication) +
    cvStructure * levelScore(levels.cvStructure)
  return clampScore(Math.round(weighted / total))
}

/**
 * The three category scores combine into the overall score with the weights
 * the app has always used. Extracted from the inline expression at the call
 * site so tests can import and verify it directly rather than restating the
 * weights. Same operations, same order, same rounding — behaviour unchanged.
 */
export const CATEGORY_BLEND_WEIGHTS = {
  evidenceAndAppliedAbility: 0.4,
  technicalCapability: 0.35,
  fitAndCommunication: 0.25,
} as const

export function blendCategoryScores(
  evidenceAndAppliedAbility: number,
  technicalCapability: number,
  fitAndCommunication: number,
): number {
  return clampScore(
    Math.round(
      CATEGORY_BLEND_WEIGHTS.evidenceAndAppliedAbility * evidenceAndAppliedAbility +
        CATEGORY_BLEND_WEIGHTS.technicalCapability * technicalCapability +
        CATEGORY_BLEND_WEIGHTS.fitAndCommunication * fitAndCommunication,
    ),
  )
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

export function isEvidenceLevel(value: unknown): value is EvidenceLevel {
  return value === 'strong' || value === 'partial' || value === 'none'
}

/**
 * Shared safety net for every holistic strong/partial/none subcriterion that
 * carries its own evidence excerpt (all of them except cv_structure_level,
 * which is a formatting judgment with nothing to quote). A "none" level
 * trivially passes (nothing claimed to verify), but a "strong"/"partial"
 * level is downgraded to "none" whenever its cited excerpt is empty (a
 * claim with nothing behind it — isGroundedInCv's own "empty text trivially
 * grounds" rule exists for the "none" case, not this one) or isn't actually
 * traceable to the CV — never trusting the "do not invent" prompt
 * instructions alone. Throws on a malformed level so the caller's existing
 * validate-or-retry flow catches it the same way an invalid match_strength
 * or uvp_evidence_level already does.
 */
export function resolveGroundedLevel(level: unknown, evidence: unknown, cvText: string): EvidenceLevel {
  if (!isEvidenceLevel(level)) throw new Error(`Invalid evidence level: ${JSON.stringify(level)}`)
  if (level === 'none') return 'none'
  const trimmed = typeof evidence === 'string' ? evidence.trim() : ''
  if (!trimmed) return 'none'
  return isGroundedInCv(trimmed, cvText) ? level : 'none'
}

// ---------------------------------------------------------------------------
// Evidence dependent classification invariants
//
// Live validation of the previous prompt found a confirmed false positive:
// a CV containing nothing but a buzzword skills list and a one line summary
// (no employment, no project, no academic or volunteer work at all) was
// still rated "strong" on applied_evidence, applied_skill, skill_application,
// and tools_platforms, reproducibly across repeated runs. Prompt wording
// alone ("shown in use, not just listed") did not reliably stop this, so
// these checks enforce it deterministically, on the model's own structured
// evidence_reference for each classification, before any score is
// calculated. A violation throws (never silently downgrades the level) so
// the caller's existing retry-then-fail-safe path in index.ts handles it:
// one retry with a correction message identifying exactly which rule was
// broken, and if the corrected response still violates it, the check fails
// safely with no score saved and no credit consumed.
// ---------------------------------------------------------------------------

interface EvidenceDependentFieldConfig {
  // Whether a reference anchored only in a non-demonstrating section
  // (skills list or summary) can still support "partial" — true only for
  // tools_platforms, where a listed-only tool may earn limited recognition
  // for claimed familiarity, but never "strong". Every other evidence
  // dependent field requires a genuine demonstrating entry for both
  // "strong" and "partial".
  allowListedForPartial: boolean
}

const EVIDENCE_DEPENDENT_FIELD_CONFIG: Record<string, EvidenceDependentFieldConfig> = {
  applied_evidence: { allowListedForPartial: false },
  applied_skill: { allowListedForPartial: false },
  skill_application: { allowListedForPartial: false },
  results: { allowListedForPartial: false },
  tools_platforms: { allowListedForPartial: true },
}

export interface ResolvedEvidenceClassification {
  level: EvidenceLevel
  reference: EvidenceReference | null
}

/**
 * Validates and resolves one evidence dependent classification against its
 * own structured reference. Called with the model's raw (not yet grounding
 * downgraded) level and reference, so a violation is caught and retried
 * before any downstream grounding/scoring logic runs.
 *
 * The reference is nullable at the schema level (see EVIDENCE_REFERENCE_SCHEMA
 * in index.ts): a "none" classification requires null, never a fabricated
 * placeholder object, and a "strong"/"partial" classification requires a
 * real, valid object, never null. Making "none" mean "null" (rather than an
 * object with every field emptied out) removed a whole class of live
 * failures where the model correctly judged there was no real evidence but
 * still had to construct a well formed but content free object to satisfy
 * the old always-an-object schema.
 *
 * One specific self-contradiction is normalized rather than rejected: a
 * "strong"/"partial" level paired with evidence_type "none" outside the
 * tools_platforms exception. Live testing found the model reproducibly
 * hitting exactly this shape on the thinnest CVs (education-and-skills-list
 * only, an empty work history with a short summary) — it correctly senses
 * there is no real, typeable activity behind the claim, but does not
 * reliably act on the correction retry by changing the level to "none" as
 * well, driving up retry-exhaustion on precisely the CVs this is supposed
 * to handle gracefully. The model's own evidence_type "none" is the more
 * trustworthy signal here, so this is resolved to { level: "none",
 * reference: null } deterministically — never upward, so it can only ever
 * lower a rating, never inflate one. Every other violation below (a missing
 * reference, an invalid shape, a listed-only claim outside the one allowed
 * exception) still throws for the one-shot correction retry: those are
 * clear-cut, model-correctable mistakes, not a case where the model is
 * telling us in its own output that there is nothing to point to.
 *
 * Every thrown message is deliberately short and names exactly: the
 * criterion, its classification, whether the reference must be null or an
 * object, and the specific rule broken — this text is fed back to the model
 * verbatim as the one-shot correction instruction (see the correctionNote
 * block in index.ts), so it must be actionable on its own, not just
 * descriptive.
 */
export function resolveEvidenceDependentClassification(
  fieldName: keyof typeof EVIDENCE_DEPENDENT_FIELD_CONFIG,
  level: unknown,
  reference: unknown,
): ResolvedEvidenceClassification {
  if (!isEvidenceLevel(level)) {
    throw new Error(`${fieldName}: invalid or missing evidence_level`)
  }

  if (level === 'none') {
    if (reference !== null) {
      throw new Error(
        `${fieldName}: classification is "none", so ${fieldName}_reference must be null, not an object. Do not invent a project, employer, deliverable, or CV section when there is no evidence.`,
      )
    }
    return { level: 'none', reference: null }
  }

  // level is "strong" or "partial" from here on.
  if (reference === null) {
    throw new Error(
      `${fieldName}: classification is "${level}", so ${fieldName}_reference must be a valid evidence object (cv_section, entry_reference, evidence_basis, evidence_type), not null.`,
    )
  }
  if (!isValidEvidenceReference(reference)) {
    throw new Error(
      `${fieldName}: classification is "${level}", so ${fieldName}_reference must be a complete, valid evidence object (cv_section, entry_reference, evidence_basis, evidence_type).`,
    )
  }

  const config = EVIDENCE_DEPENDENT_FIELD_CONFIG[fieldName]
  const isListedOnly = NON_DEMONSTRATING_SECTIONS.has(reference.cv_section)
  // The one narrow exception (tools_platforms "partial" earned purely from a
  // bare skills list mention) is inherently minimal: there is nothing more
  // to say about it than "it's listed", so it's validated leniently on
  // every field except cv_section itself, rather than relying on the model
  // to also produce a well filled entry_reference/evidence_basis/evidence_type
  // for a claim that has essentially no further detail behind it.
  const listedPartialException = isListedOnly && level === 'partial' && config.allowListedForPartial
  if (listedPartialException) return { level, reference }

  if (!reference.entry_reference.trim() || !reference.evidence_basis.trim()) {
    throw new Error(`${fieldName}: classification is "${level}", so its evidence object needs a non-empty entry_reference and evidence_basis.`)
  }
  if (reference.evidence_type === 'none') {
    // See the doc comment above: this specific self-contradiction is
    // normalized down to "none", not rejected.
    return { level: 'none', reference: null }
  }
  if (isListedOnly && level === 'strong') {
    throw new Error(
      `${fieldName}: classification is "strong", but cv_section is "${reference.cv_section}" (listed only) — a listed skill may only support tools_platforms partial claimed familiarity, never "strong" here or anywhere else.`,
    )
  }
  if (isListedOnly && level === 'partial' && !config.allowListedForPartial) {
    throw new Error(
      `${fieldName}: classification is "partial", but cv_section is "${reference.cv_section}" (listed only) — a listed skill may only support tools_platforms partial claimed familiarity, not ${fieldName}. Change this classification to "none" and its reference to null, or point to a genuine demonstrating entry.`,
    )
  }
  if (!isListedOnly && !DEMONSTRATING_SECTIONS.has(reference.cv_section)) {
    throw new Error(`${fieldName}: cv_section "${reference.cv_section}" is not a recognized CV section.`)
  }
  return { level, reference }
}

// The prompt explicitly allows one real entry (one project, one job) to
// support all five evidence dependent fields at once — applied_evidence,
// applied_skill, skill_application, results, and tools_platforms are five
// different questions about the same underlying entry, and a candidate with
// exactly one strong project must be able to earn full marks across all of
// them from it, the same as a candidate with five separate projects. What
// this check targets is specifically identical, generic filler text pasted
// across most/all of the five fields with no attempt at criterion specific
// relevance — not the entry itself being reused, which the entry_reference
// field is expected to repeat. Requiring 4 of the 5 fields to share byte
// identical evidence_basis text (rather than any 2, or even 3) keeps this a
// rare, high confidence filler signal instead of penalizing a well
// evidenced single-project candidate for the model's natural tendency to
// write similar short paraphrases about the same real fact.
const MIN_FIELDS_FOR_REUSE_VIOLATION = 4

/**
 * One real evidence entry may legitimately support every one of these five
 * subcriteria (see the prompt's own "do not double count" guidance, and the
 * fairness requirement that a single strong project reach full marks) — the
 * entry_reference repeating across fields is expected and never flagged.
 * Only identical, unadapted evidence_basis text across most of the five
 * fields is treated as filler with no criterion specific explanation.
 * Null references (a "none" classification) are skipped entirely — there is
 * nothing to compare.
 */
export function findReusedEvidenceBasis(references: Record<string, EvidenceReference | null>): string[][] {
  const byBasis = new Map<string, string[]>()
  for (const [field, reference] of Object.entries(references)) {
    if (reference === null) continue
    const key = reference.evidence_basis.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!key) continue
    const existing = byBasis.get(key)
    if (existing) existing.push(field)
    else byBasis.set(key, [field])
  }
  return [...byBasis.values()].filter((fields) => fields.length >= MIN_FIELDS_FOR_REUSE_VIOLATION)
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

function withPracticalExample(item: string): string {
  if (/\bExample:/i.test(item)) return item
  return `${item.replace(/[.!?]+$/, '')}. Example: Add one truthful CV bullet that shows the relevant action, context, and result.`
}

function requirementImprovement(requirement: RawRequirement): string {
  const name = requirementName(requirement) ?? 'this requirement'
  if (verificationStage(requirement) === 'application') {
    if (WORK_AUTH_PATTERN.test(requirement.requirement)) {
      return 'Clarify work authorization. The application does not show your general eligibility to work in the required country. Example: If accurate, add “Authorized to work in the Netherlands” to your professional summary or CV footer. Never include a BSN or permit number.'
    }
    return 'Confirm your availability. The application does not confirm your availability for the required shifts. Example: State your availability in the application form or recruiter message.'
  }
  if (requirement.match_strength === 'partial') {
    return `Strengthen evidence for ${name}. Your CV shows related evidence but does not fully demonstrate this requirement. Example: Add a truthful bullet explaining where you used this capability and the result achieved.`
  }
  return `Show evidence for ${name}. Your CV does not currently provide verified evidence for this requirement. Example: Add the relevant qualification, skill, or experience only if you genuinely have it.`
}

function ensureThreeNeedsImprovementItems(
  generated: string[],
  requirements: RawRequirement[],
  uvpLevel: UvpEvidenceLevel,
): string[] {
  const candidates = generated.map(withPracticalExample)
  const gaps = [
    ...requirements.filter((item) => item.match_strength === 'none' && item.importance === 'must_have'),
    ...requirements.filter((item) => item.match_strength === 'partial'),
    ...requirements.filter((item) => item.match_strength === 'none' && item.importance !== 'must_have'),
  ]
  for (const gap of gaps) candidates.push(requirementImprovement(gap))

  if (uvpLevel !== 'strong') {
    candidates.push(
      'Strengthen your unique value. Your CV does not yet show a strong, role specific reason to choose you over another qualified candidate. Example: Add one truthful achievement using Evidence, Strength, and Employer Value.',
    )
  }
  candidates.push(
    'Prioritize your closest match. Make the experience most relevant to this job the easiest evidence for a recruiter to find. Example: Move the closest matching role or achievement higher and describe its employer value.',
    'Make impact easy to scan. Strengthen one relevant achievement with a clear result where accurate. Example: “Improved X by Y% within Z months” using only figures you can verify.',
  )

  const unique: string[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const safe = makePrivacySafeImprovement(candidate)
    if (!safe) continue
    const key = safe.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(safe)
    if (unique.length === 3) break
  }
  return unique
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

// ---------------------------------------------------------------------------
// Auditable score breakdown
//
// Every string below is authored here, once, independent of any specific
// candidate — never derived from a CV excerpt, a job description excerpt, or
// any other candidate-specific text. That's what makes it safe to persist:
// the breakdown records *which classification* each subcriterion received
// and *why that classification means what it means*, never *what the CV
// said*. essential_skills is the one subcriterion with a dynamic reason,
// and even that only ever includes a percentage, never quoted text.
// ---------------------------------------------------------------------------

const SUBCRITERION_REASONS: Record<string, Record<EvidenceLevel, string>> = {
  applied_evidence: {
    strong: 'Strong, specific evidence of relevant applied work (employment or otherwise) for this role.',
    partial: 'Some relevant applied work found, but missing detail, contribution, or role appropriate complexity.',
    none: 'No credible relevant applied work found in the CV.',
  },
  applied_skill: {
    strong: 'Relevant skills are clearly shown in use, not just listed.',
    partial: 'Some evidence of applying relevant skills, but limited or not fully demonstrated.',
    none: 'Relevant skills are only listed in the CV, never shown in use.',
  },
  results: {
    strong: 'A credible outcome, completed deliverable, or demonstrated learning is shown.',
    partial: 'A partial or weakly evidenced outcome or deliverable is shown.',
    none: 'No credible outcome or completed deliverable is shown.',
  },
  skill_application: {
    strong: "This job's essential skills are shown in active use, not just named.",
    partial: "This job's essential skills have some usage evidence, but it is limited.",
    none: "This job's essential skills are only named in the CV, never shown in use.",
  },
  tools_platforms: {
    strong: 'Relevant tools, platforms, or technical methods for this role are evidenced by actual use.',
    partial: 'Relevant tools or platforms are only partially evidenced.',
    none: 'No evidenced use of relevant tools or platforms for this role.',
  },
  certifications: {
    strong: 'Relevant education, training, or certification is present.',
    partial: 'Somewhat relevant education, training, or certification is present.',
    none: 'No relevant education, training, or certification is shown.',
  },
  role_fit: {
    strong: 'The overall CV clearly fits this specific position and its advertised seniority.',
    partial: 'The CV shows a partial fit for this specific position or seniority level.',
    none: 'The CV does not show a clear fit for this specific position.',
  },
  value_proposition: {
    strong: 'Clear, differentiating evidence beyond basic qualification is shown.',
    partial: 'Some differentiating evidence is shown, but limited.',
    none: 'No differentiating evidence beyond basic qualification is shown.',
  },
  technical_communication: {
    strong: 'Technical work is explained clearly enough for a non specialist recruiter to follow.',
    partial: 'Technical work is explained, but not always clearly.',
    none: 'Technical work is not explained clearly enough to follow.',
  },
  cv_structure: {
    strong: 'The CV is well structured, readable, and easy to scan.',
    partial: 'The CV is somewhat readable but has structural weaknesses.',
    none: 'The CV is difficult to read or poorly structured.',
  },
}

// essential_skills isn't a model-classified level, so it gets its own
// display bucket derived purely from its own already-computed percentage —
// used only to decide which color/label a UI might show, never fed back
// into any calculation.
function deriveDisplayLevel(percentScore: number): EvidenceLevel {
  if (percentScore >= 80) return 'strong'
  if (percentScore >= 40) return 'partial'
  return 'none'
}

function subcriterion(key: string, level: EvidenceLevel, weight: number): ScoreBreakdownSubcriterion {
  return { level, points: (weight * levelScore(level)) / 100, max: weight, reason: SUBCRITERION_REASONS[key][level] }
}

/**
 * Builds the persisted, auditable record of how a score was computed. Reads
 * only values already computed elsewhere in normalizeAnalysis (the resolved
 * evidence levels and the three category totals) — it introduces no new
 * scoring logic of its own, only packages the existing one for storage.
 */
function buildScoreBreakdown(params: {
  model: string | null
  levels: {
    appliedEvidence: EvidenceLevel
    appliedSkill: EvidenceLevel
    results: EvidenceLevel
    skillApplication: EvidenceLevel
    tools: EvidenceLevel
    certifications: EvidenceLevel
    roleFit: EvidenceLevel
    valueProposition: EvidenceLevel
    technicalCommunication: EvidenceLevel
    cvStructure: EvidenceLevel
  }
  essentialSkillsScore: number
  category1Score: number
  category2Score: number
  category3Score: number
  rawWeightedScore: number
  criticalGapCapped: boolean
  finalScore: number
}): ScoreBreakdown {
  const { levels } = params
  const essentialSkillsLevel = deriveDisplayLevel(params.essentialSkillsScore)

  return {
    scoring_method: 'detailed_rubric',
    rubric_version: RUBRIC_VERSION,
    prompt_version: PROMPT_VERSION,
    model: params.model,
    calculated_at: new Date().toISOString(),
    categories: {
      relevant_evidence_and_applied_ability: {
        subtotal: params.category1Score,
        max_points: CATEGORY_1_POINTS.appliedEvidence + CATEGORY_1_POINTS.appliedSkill + CATEGORY_1_POINTS.results,
        subcriteria: {
          applied_evidence: subcriterion('applied_evidence', levels.appliedEvidence, CATEGORY_1_POINTS.appliedEvidence),
          applied_skill: subcriterion('applied_skill', levels.appliedSkill, CATEGORY_1_POINTS.appliedSkill),
          results: subcriterion('results', levels.results, CATEGORY_1_POINTS.results),
        },
      },
      technical_and_role_specific_capability: {
        subtotal: params.category2Score,
        max_points:
          CATEGORY_2_POINTS.essentialSkills +
          CATEGORY_2_POINTS.skillApplication +
          CATEGORY_2_POINTS.tools +
          CATEGORY_2_POINTS.certifications,
        subcriteria: {
          essential_skills: {
            level: essentialSkillsLevel,
            points: (CATEGORY_2_POINTS.essentialSkills * params.essentialSkillsScore) / 100,
            max: CATEGORY_2_POINTS.essentialSkills,
            reason: `Essential skills matched ${params.essentialSkillsScore}% of this job's weighted requirement points.`,
          },
          skill_application: subcriterion('skill_application', levels.skillApplication, CATEGORY_2_POINTS.skillApplication),
          tools_platforms: subcriterion('tools_platforms', levels.tools, CATEGORY_2_POINTS.tools),
          certifications: subcriterion('certifications', levels.certifications, CATEGORY_2_POINTS.certifications),
        },
      },
      role_fit_and_recruiter_communication: {
        subtotal: params.category3Score,
        max_points:
          CATEGORY_3_POINTS.roleFit +
          CATEGORY_3_POINTS.valueProposition +
          CATEGORY_3_POINTS.technicalCommunication +
          CATEGORY_3_POINTS.cvStructure,
        subcriteria: {
          role_fit: subcriterion('role_fit', levels.roleFit, CATEGORY_3_POINTS.roleFit),
          value_proposition: subcriterion('value_proposition', levels.valueProposition, CATEGORY_3_POINTS.valueProposition),
          technical_communication: subcriterion(
            'technical_communication',
            levels.technicalCommunication,
            CATEGORY_3_POINTS.technicalCommunication,
          ),
          cv_structure: subcriterion('cv_structure', levels.cvStructure, CATEGORY_3_POINTS.cvStructure),
        },
      },
    },
    raw_weighted_score: params.rawWeightedScore,
    critical_gap_capped: params.criticalGapCapped,
    final_score: params.finalScore,
  }
}

function sumPoints(category: ScoreBreakdownCategory): number {
  return Object.values(category.subcriteria).reduce((sum, s) => sum + s.points, 0)
}

/**
 * Independent recomputation, not a repeat of buildScoreBreakdown's own
 * arithmetic — every check below re-derives its expected value from the
 * stored subcriteria/category numbers themselves and compares, so a future
 * bug in buildScoreBreakdown (not just in the caller) would still be caught
 * here rather than silently persisted. Throws on the first inconsistency
 * found, which normalizeAnalysis's caller already treats as a
 * retry-then-last-resort-fallback case, the same as any other malformed
 * model output.
 */
export function validateScoreBreakdown(breakdown: ScoreBreakdown): void {
  if (breakdown.scoring_method !== 'detailed_rubric') {
    throw new Error(`score_breakdown: unrecognized scoring_method ${JSON.stringify(breakdown.scoring_method)}`)
  }

  const categories = Object.entries(breakdown.categories) as [string, ScoreBreakdownCategory][]

  for (const [name, category] of categories) {
    if (!isFiniteNumber(category.subtotal) || category.subtotal < 0 || category.subtotal > 100) {
      throw new Error(`score_breakdown: ${name} subtotal is not a finite 0-100 number`)
    }
    for (const [subKey, sub] of Object.entries(category.subcriteria)) {
      if (!isFiniteNumber(sub.points) || sub.points < 0 || sub.points > sub.max) {
        throw new Error(`score_breakdown: ${name}.${subKey} points out of its own 0-${sub.max} range`)
      }
    }
    const expectedSubtotal = clampScore(Math.round((sumPoints(category) / category.max_points) * 100))
    if (expectedSubtotal !== category.subtotal) {
      throw new Error(
        `score_breakdown: ${name} subtotal (${category.subtotal}) does not equal its subcriteria (expected ${expectedSubtotal})`,
      )
    }
  }

  const [cat1, cat2, cat3] = categories.map(([, c]) => c.subtotal)
  const expectedRawWeighted = clampScore(Math.round(0.4 * cat1 + 0.35 * cat2 + 0.25 * cat3))
  if (expectedRawWeighted !== breakdown.raw_weighted_score) {
    throw new Error(
      `score_breakdown: raw_weighted_score (${breakdown.raw_weighted_score}) does not equal the three category subtotals (expected ${expectedRawWeighted})`,
    )
  }

  if (!Number.isInteger(breakdown.final_score) || breakdown.final_score < 0 || breakdown.final_score > 100) {
    throw new Error('score_breakdown: final_score is not a whole number in 0-100')
  }

  if (breakdown.critical_gap_capped) {
    if (breakdown.final_score > 49 || breakdown.final_score > breakdown.raw_weighted_score) {
      throw new Error('score_breakdown: critical_gap_capped is set but final_score is not actually capped')
    }
  } else if (breakdown.final_score !== breakdown.raw_weighted_score) {
    throw new Error(
      `score_breakdown: final_score (${breakdown.final_score}) does not equal raw_weighted_score (${breakdown.raw_weighted_score}) and critical_gap_capped is false`,
    )
  }
}

// The shape the private check_score_audits table actually stores: a single
// flat map of all 11 subcriteria (dropping the category grouping, which the
// table represents separately in `category_totals`) plus the three
// category subtotals. Pure reshaping only — no new values, no new
// validation; call validateScoreBreakdown on the source breakdown first.
// ---------------------------------------------------------------------------
// Privacy safe monitoring reason codes
//
// Maps a thrown validation/generation failure message (which may echo
// nothing sensitive by construction — every throw site in this file uses a
// static, template-derived message, never CV/job description/raw AI
// content) to one of a small, fixed set of non-sensitive reason codes
// suitable for aggregate technical monitoring. This exists specifically so
// index.ts's monitoring log never needs to include the raw error message
// itself (which, while not sensitive today, is free-form prose and an easy
// place for a future edit to accidentally leak something) — only ever one
// of these codes.
// ---------------------------------------------------------------------------

export type ValidationFailureReasonCode =
  | 'missing_reference'
  | 'reference_must_be_null'
  | 'listed_not_demonstrated'
  | 'reused_generic_evidence'
  | 'invalid_score_total'
  | 'invalid_requirement_matrix'
  | 'unverified_claim_reported'
  | 'non_english_content'
  | 'model_timeout'
  | 'model_api_error'
  | 'other_validation_failure'

/**
 * Classifies the aggregated failure message thrown by withRetry (or a
 * single attempt's message) into one fixed, non-sensitive reason code.
 * Checked in priority order against message substrings each throw site in
 * this file is known to produce — never against arbitrary model output.
 */
export function classifyValidationFailure(message: string): ValidationFailureReasonCode {
  if (/timed out/i.test(message)) return 'model_timeout'
  if (/OpenAI API error/i.test(message)) return 'model_api_error'
  if (/must be null/i.test(message)) return 'reference_must_be_null'
  if (/must be a (?:valid|complete, valid) evidence object|needs a non-empty entry_reference/i.test(message)) {
    return 'missing_reference'
  }
  if (/listed only/i.test(message)) return 'listed_not_demonstrated'
  if (/evidence_basis is identical, unadapted filler/i.test(message)) return 'reused_generic_evidence'
  if (/score_breakdown:/i.test(message)) return 'invalid_score_total'
  if (/requirement matrix|uvp_evidence_level|cv_structure_level/i.test(message)) return 'invalid_requirement_matrix'
  if (/unverified claims/i.test(message)) return 'unverified_claim_reported'
  if (/did not look like English/i.test(message)) return 'non_english_content'
  return 'other_validation_failure'
}

export interface ScoreAuditRecord {
  rubric_version: string
  prompt_version: string
  model_identifier: string | null
  scoring_method: ScoringMethod
  subcriteria: Record<string, ScoreBreakdownSubcriterion>
  category_totals: Record<string, { subtotal: number; max_points: number }>
  evidence_references: Record<string, EvidenceReference | null>
  final_score: number
  calculated_at: string
}

export function toAuditRecord(
  breakdown: ScoreBreakdown,
  evidenceReferences: Record<string, EvidenceReference | null>,
): ScoreAuditRecord {
  const subcriteria: Record<string, ScoreBreakdownSubcriterion> = {}
  const category_totals: Record<string, { subtotal: number; max_points: number }> = {}

  for (const [categoryName, category] of Object.entries(breakdown.categories)) {
    category_totals[categoryName] = { subtotal: category.subtotal, max_points: category.max_points }
    Object.assign(subcriteria, category.subcriteria)
  }

  return {
    rubric_version: breakdown.rubric_version,
    prompt_version: breakdown.prompt_version,
    model_identifier: breakdown.model,
    scoring_method: breakdown.scoring_method,
    subcriteria,
    category_totals,
    evidence_references: evidenceReferences,
    final_score: breakdown.final_score,
    calculated_at: breakdown.calculated_at,
  }
}

export function normalizeAnalysis(raw: RawAnalysis, cvText: string, meta: { model?: string | null } = {}): AnalysisResult {
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

  if (!isEvidenceLevel(raw.uvp_evidence_level)) {
    throw new Error('Missing or invalid uvp_evidence_level')
  }
  if (!isEvidenceLevel(raw.cv_structure_level)) {
    throw new Error('Missing or invalid cv_structure_level')
  }

  // Deterministic invariants for the five evidence dependent subcriteria:
  // a "strong"/"partial" level must be backed by a structured reference to
  // a genuine demonstrating entry, never a bare skills list or summary
  // mention alone (see EVIDENCE_DEPENDENT_FIELD_CONFIG above for the one
  // exception — tools_platforms may earn "partial" from a listed-only
  // mention, but never "strong"). Throws on the raw, not-yet-grounding
  // downgraded level so a violation is corrected on retry or fails the
  // check safely, rather than being silently downgraded after the fact.
  const resolvedAppliedEvidence = resolveEvidenceDependentClassification(
    'applied_evidence',
    raw.applied_evidence_level,
    raw.applied_evidence_reference,
  )
  const resolvedAppliedSkill = resolveEvidenceDependentClassification(
    'applied_skill',
    raw.applied_skill_evidence_level,
    raw.applied_skill_reference,
  )
  const resolvedResults = resolveEvidenceDependentClassification('results', raw.results_evidence_level, raw.results_reference)
  const resolvedSkillApplication = resolveEvidenceDependentClassification(
    'skill_application',
    raw.skill_application_evidence_level,
    raw.skill_application_reference,
  )
  const resolvedToolsPlatforms = resolveEvidenceDependentClassification(
    'tools_platforms',
    raw.tools_platforms_evidence_level,
    raw.tools_platforms_reference,
  )

  const evidenceReferences: Record<string, EvidenceReference | null> = {
    applied_evidence: resolvedAppliedEvidence.reference,
    applied_skill: resolvedAppliedSkill.reference,
    results: resolvedResults.reference,
    skill_application: resolvedSkillApplication.reference,
    tools_platforms: resolvedToolsPlatforms.reference,
  }
  const reused = findReusedEvidenceBasis(evidenceReferences)
  if (reused.length > 0) {
    throw new Error(
      `${reused.map((fields) => fields.join(', ')).join(' | ')}: evidence_basis is identical, unadapted filler across most of these fields. One real entry may support several fields, but each evidence_basis must explain how it supports that specific criterion, not repeat the same sentence.`,
    )
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
    // A strong/partial claim with no excerpt at all is treated the same as
    // an ungrounded one, not as trivially grounded — isGroundedInCv's own
    // "empty text passes" rule exists for a genuine 'none' match (nothing
    // was claimed), not for a claim backed by nothing.
    if (claimsMatch && !requirement.cv_evidence.trim()) {
      return { ...requirement, critical: safeCritical, match_strength: 'none' as const, cv_evidence: '' }
    }
    if (claimsMatch && !isGroundedInCv(requirement.cv_evidence, cvText)) {
      return { ...requirement, critical: safeCritical, match_strength: 'none' as const, cv_evidence: '' }
    }
    return requirement.match_strength === 'none'
      ? { ...requirement, critical: safeCritical, cv_evidence: '' }
      : { ...requirement, critical: safeCritical }
    })
  const evidenceSafeUvpLevel = resolveGroundedLevel(raw.uvp_evidence_level, raw.uvp_evidence, cvText)

  // Same grounding safety net extended to every new scorecard subcriterion
  // that carries a quotable excerpt: a "strong"/"partial" classification
  // only stands if its cited evidence is verifiably traceable to the CV,
  // otherwise it's conservatively downgraded to "none" rather than trusted.
  const evidenceSafeAppliedLevel = resolveGroundedLevel(resolvedAppliedEvidence.level, raw.applied_evidence, cvText)
  const evidenceSafeAppliedSkillLevel = resolveGroundedLevel(
    resolvedAppliedSkill.level,
    raw.applied_skill_evidence,
    cvText,
  )
  const evidenceSafeResultsLevel = resolveGroundedLevel(resolvedResults.level, raw.results_evidence, cvText)
  const evidenceSafeSkillApplicationLevel = resolveGroundedLevel(
    resolvedSkillApplication.level,
    raw.skill_application_evidence,
    cvText,
  )
  const evidenceSafeToolsLevel = resolveGroundedLevel(
    resolvedToolsPlatforms.level,
    raw.tools_platforms_evidence,
    cvText,
  )
  const evidenceSafeCertificationsLevel = resolveGroundedLevel(
    raw.certifications_evidence_level,
    raw.certifications_evidence,
    cvText,
  )
  const evidenceSafeRoleFitLevel = resolveGroundedLevel(raw.role_fit_evidence_level, raw.role_fit_evidence, cvText)
  const evidenceSafeTechnicalCommunicationLevel = resolveGroundedLevel(
    raw.technical_communication_level,
    raw.technical_communication_evidence,
    cvText,
  )
  // cv_structure_level has no evidence excerpt to ground (see the RawAnalysis
  // comment) — its enum validity was already checked above.
  const cvStructureLevel = raw.cv_structure_level

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

  // experience_score / skills_score / uvp_score keep their original field
  // names (nothing downstream — DB columns, complete_check_analysis RPC
  // params, TypeScript types — needed to change) but now represent the three
  // expanded scorecard categories: Relevant evidence and applied ability (40
  // pts), Technical and role specific capability (35 pts), and Role fit and
  // recruiter communication (25 pts), each itself a weighted blend of the
  // subcriteria computed above rather than a single coarse judgment.
  const experienceScore = calculateEvidenceAbilityScore({
    appliedEvidence: evidenceSafeAppliedLevel,
    appliedSkill: evidenceSafeAppliedSkillLevel,
    results: evidenceSafeResultsLevel,
  })
  const skillsScore = calculateCapabilityScore(dedupedRequirements, {
    skillApplication: evidenceSafeSkillApplicationLevel,
    tools: evidenceSafeToolsLevel,
    certifications: evidenceSafeCertificationsLevel,
  })
  const uvpScore = calculateFitCommunicationScore({
    roleFit: evidenceSafeRoleFitLevel,
    valueProposition: evidenceSafeUvpLevel,
    technicalCommunication: evidenceSafeTechnicalCommunicationLevel,
    cvStructure: cvStructureLevel,
  })

  const rawWeightedScore = blendCategoryScores(experienceScore, skillsScore, uvpScore)
  const finalScore = applyCriticalGapCap(rawWeightedScore, dedupedRequirements)
  const criticalGapCapped = finalScore !== rawWeightedScore
  const improvements = finalScore === 100
    ? []
    : finalScore >= 85
      ? generatedImprovements.slice(0, 1)
      : finalScore >= 61
        ? ensureThreeNeedsImprovementItems(generatedImprovements, dedupedRequirements, evidenceSafeUvpLevel)
        : generatedImprovements.slice(0, 3)
  const scoreAwareProspects = buildScoreAwareProspects(finalScore, dedupedRequirements, improvements)

  const essentialSkillsScore = calculateCategoryScore(dedupedRequirements, 'skills')
  const scoreBreakdown = buildScoreBreakdown({
    model: meta.model ?? null,
    levels: {
      appliedEvidence: evidenceSafeAppliedLevel,
      appliedSkill: evidenceSafeAppliedSkillLevel,
      results: evidenceSafeResultsLevel,
      skillApplication: evidenceSafeSkillApplicationLevel,
      tools: evidenceSafeToolsLevel,
      certifications: evidenceSafeCertificationsLevel,
      roleFit: evidenceSafeRoleFitLevel,
      valueProposition: evidenceSafeUvpLevel,
      technicalCommunication: evidenceSafeTechnicalCommunicationLevel,
      cvStructure: cvStructureLevel,
    },
    essentialSkillsScore,
    category1Score: experienceScore,
    category2Score: skillsScore,
    category3Score: uvpScore,
    rawWeightedScore,
    criticalGapCapped,
    finalScore,
  })
  // Never persist a breakdown whose own numbers don't add up — this throws
  // into the same retry-then-last-resort-fallback path every other
  // malformed-output case already uses (see generateFeedback in index.ts).
  validateScoreBreakdown(scoreBreakdown)

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
    score_breakdown: scoreBreakdown,
    evidence_references: evidenceReferences,
  }
}
