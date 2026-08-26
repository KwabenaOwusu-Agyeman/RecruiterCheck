// Run with: npx tsx supabase/functions/analyze-check/logic.test.ts
import assert from 'node:assert/strict'
import {
  applyCriticalGapCap,
  calculateCapabilityScore,
  calculateCategoryScore,
  calculateEvidenceAbilityScore,
  calculateFitCommunicationScore,
  calculateUvpScore,
  capRequirements,
  CATEGORY_1_POINTS,
  CATEGORY_2_POINTS,
  CATEGORY_3_POINTS,
  combineFinding,
  extractQuantifiedClaims,
  findReusedEvidenceBasis,
  hasUnsupportedNamedEntity,
  isGroundedInCv,
  isValidEvidenceReference,
  levelScore,
  looksLikeEnglish,
  normalizeAnalysis,
  PROMPT_VERSION,
  RUBRIC_VERSION,
  stripDashes,
  toAuditRecord,
  classifyValidationFailure,
  resolveEvidenceDependentClassification,
  validateScoreBreakdown,
  withRetry,
  type EvidenceLevel,
  type EvidenceReference,
  type RawAnalysis,
  type RawRequirement,
  type ScoreBreakdown,
} from './logic.ts'
import { getScoreLabel } from '../../../src/lib/scoring'

let passed = 0
function test(name: string, fn: () => void) {
  try {
    fn()
    passed += 1
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`FAIL - ${name}`)
    throw error
  }
}

async function testAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    passed += 1
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`FAIL - ${name}`)
    throw error
  }
}

// Covers the content words used by every default/overridden cv_evidence and
// uvp_evidence string below, so normalizeAnalysis's evidence grounding check
// passes for all the "positive" fixtures without every test needing its own
// bespoke CV text.
const CV_TEXT = `
Managed the exact responsibility this requirement describes across several major initiatives.
Managed supplier and client relationships across Ghana, Liberia, Nigeria and Sierra Leone.
Led a migration that reduced infrastructure cost by a documented amount over eighteen months.
Grew the flagship product from zero users to a documented multi million dollar revenue line within three years.
Delivered documented, employer relevant differentiation through repeated successful launches.
`

function requirement(overrides: Partial<RawRequirement> = {}): RawRequirement {
  return {
    requirement: 'Relevant requirement',
    category: 'experience',
    importance: 'important',
    critical: false,
    match_strength: 'strong',
    cv_evidence: 'Managed the exact responsibility this requirement describes.',
    ...overrides,
  }
}

// A grounded excerpt reusable across every new subcriterion's evidence field
// below — grounding only checks textual presence in the CV, not uniqueness
// per field, so the same quote can back several different judgments the way
// a real CV excerpt can support more than one classification.
const GROUNDED_EVIDENCE = 'Led a migration that reduced infrastructure cost by a documented amount over eighteen months.'

// Sets every new scorecard subcriterion (added on top of the pre-existing
// requirement matrix and UVP fields) to the same level, so a test can either
// take the default ('none' — the least surprising baseline, and the one
// baseRaw uses) or explicitly opt a whole test into 'strong'/'partial' when
// it needs those dimensions to contribute. cv_structure_level has no
// evidence field (see the RawAnalysis comment in logic.ts) so it's just the
// bare level.
// A "demonstrating" reference (experience/projects/education/etc — anything
// other than a bare skills list or summary mention) with a distinct
// evidence_basis per field, since findReusedEvidenceBasis would otherwise
// reject identical text reused across the five evidence dependent fields.
function demonstratingReference(field: string, evidenceType: EvidenceReference['evidence_type'] = 'project'): EvidenceReference {
  return {
    cv_section: 'projects',
    entry_reference: 'Project: Test Fixture',
    evidence_basis: `Built and used the relevant capability for ${field}.`,
    evidence_type: evidenceType,
  }
}

// A "listed only" reference (skills list or summary) — the shape a bare
// keyword mention would produce, used by tests that assert this can never
// independently earn "strong", and for most evidence dependent fields not
// even "partial".
function listedOnlyReference(): EvidenceReference {
  return { cv_section: 'skills', entry_reference: 'Skills list', evidence_basis: 'Listed as a skill.', evidence_type: 'employment' }
}

function subcriteriaDefaults(level: EvidenceLevel): Partial<RawAnalysis> {
  const evidence = level === 'none' ? '' : GROUNDED_EVIDENCE
  const ref = (field: string) => (level === 'none' ? null : demonstratingReference(field))
  return {
    applied_evidence_level: level,
    applied_evidence: evidence,
    applied_evidence_reference: ref('applied_evidence'),
    applied_skill_evidence_level: level,
    applied_skill_evidence: evidence,
    applied_skill_reference: ref('applied_skill'),
    results_evidence_level: level,
    results_evidence: evidence,
    results_reference: ref('results'),
    skill_application_evidence_level: level,
    skill_application_evidence: evidence,
    skill_application_reference: ref('skill_application'),
    tools_platforms_evidence_level: level,
    tools_platforms_evidence: evidence,
    tools_platforms_reference: ref('tools_platforms'),
    certifications_evidence_level: level,
    certifications_evidence: evidence,
    role_fit_evidence_level: level,
    role_fit_evidence: evidence,
    technical_communication_level: level,
    technical_communication_evidence: evidence,
    cv_structure_level: level,
  }
}

function baseRaw(overrides: Partial<RawAnalysis> = {}): RawAnalysis {
  return {
    job_title: 'Senior Backend Engineer',
    company_name: 'Acme',
    requirements: [
      requirement({ requirement: '5+ years backend experience', category: 'experience', importance: 'must_have' }),
      requirement({ requirement: 'Node.js', category: 'skills', importance: 'must_have' }),
    ],
    uvp_evidence_level: 'partial',
    uvp_evidence: 'Led a migration that reduced infrastructure cost by a documented amount.',
    ...subcriteriaDefaults('none'),
    strength_1_finding: 'Strong sales performance',
    strength_1_evidence: 'Your record of exceeding sales targets directly supports the role.',
    strength_2_finding: 'Relevant tools',
    strength_2_evidence: 'You have hands on experience with the exact stack this role uses.',
    improvement_1_finding: 'Quantify your impact',
    improvement_1_evidence: 'Add conversion rates, revenue generated, or targets exceeded.',
    improvement_1_example: 'Implemented a new workflow that increased retention by X% within X months.',
    improvement_2_finding: 'Strengthen leadership evidence',
    improvement_2_evidence: 'Show whether you led, mentored, or owned a project end to end.',
    improvement_2_example: '',
    improvement_3_finding: 'Elaborate on your most relevant role',
    improvement_3_evidence: 'Add more detail to the role closest to this job description.',
    improvement_3_example: '',
    prospect_1: 'Your background is a reasonable match for this role.',
    prospect_2: 'Adding measurable outcomes would most increase your interview odds.',
    new_claims_introduced: [],
    ...overrides,
  }
}

function analyze(overrides: Partial<RawAnalysis> = {}, cvText: string = CV_TEXT) {
  return normalizeAnalysis(baseRaw(overrides), cvText)
}

// ---------------------------------------------------------------------------
// Formatting helpers (unchanged behavior)
// ---------------------------------------------------------------------------

test('combineFinding produces Tell -> Show format with a placeholder example', () => {
  const combined = combineFinding(
    'Quantify your impact',
    'You mention improving onboarding but do not show the result',
    'Implemented a new onboarding process that increased retention by X% within X months.',
  )
  assert.equal(
    combined,
    'Quantify your impact. You mention improving onboarding but do not show the result. Example: Implemented a new onboarding process that increased retention by X% within X months.',
  )
})

test('combineFinding omits the example clause when no example is given', () => {
  const combined = combineFinding('Strong sales performance', 'Your record of exceeding targets supports this role.')
  assert.equal(combined, 'Strong sales performance. Your record of exceeding targets supports this role.')
  assert.ok(!combined!.includes('Example:'))
})

test('combineFinding strips hyphens/dashes from all three parts', () => {
  const combined = combineFinding('Well known strength', 'Uses a data-driven approach', 'Led a cross-functional team')
  assert.ok(!combined!.includes('-'))
})

test('stripDashes converts compounds and clause dashes to plain words', () => {
  assert.equal(stripDashes('data-driven, well-known'), 'data driven, well known')
})

test('looksLikeEnglish is a reasonable heuristic', () => {
  assert.ok(looksLikeEnglish('This is a sentence that you and your team are working with for the project.'))
  assert.ok(!looksLikeEnglish('Dit is een zin die u en uw team gebruiken voor het project.'))
})

// ---------------------------------------------------------------------------
// Deterministic category / UVP scoring (TEST 9: pure functions, no LLM)
// ---------------------------------------------------------------------------

test('calculateCategoryScore: all strong must_have requirements score 100', () => {
  const reqs = [
    requirement({ requirement: 'Requirement 1', category: 'experience', importance: 'must_have', match_strength: 'strong' }),
    requirement({ requirement: 'Requirement 2', category: 'experience', importance: 'important', match_strength: 'strong' }),
  ]
  assert.equal(calculateCategoryScore(reqs, 'experience'), 100)
})

test('calculateCategoryScore: mixed strong/partial/none matches weighted correctly', () => {
  // must_have(3) strong(1) = 3, important(2) partial(0.5) = 1, nice_to_have(1) none(0) = 0
  // matched = 4, max = 3+2+1 = 6 -> round(4/6*100) = 67
  const reqs = [
    requirement({ requirement: 'Requirement 3', category: 'skills', importance: 'must_have', match_strength: 'strong' }),
    requirement({ requirement: 'Requirement 4', category: 'skills', importance: 'important', match_strength: 'partial' }),
    requirement({ requirement: 'Requirement 5', category: 'skills', importance: 'nice_to_have', match_strength: 'none' }),
  ]
  assert.equal(calculateCategoryScore(reqs, 'skills'), 67)
})

test('calculateCategoryScore: filters by category, ignores the other category entirely', () => {
  const reqs = [
    requirement({ requirement: 'Requirement 6', category: 'experience', importance: 'must_have', match_strength: 'none' }),
    requirement({ requirement: 'Requirement 7', category: 'skills', importance: 'must_have', match_strength: 'strong' }),
  ]
  assert.equal(calculateCategoryScore(reqs, 'skills'), 100)
  assert.equal(calculateCategoryScore(reqs, 'experience'), 0)
})

test('calculateUvpScore maps evidence levels to fixed values only', () => {
  assert.equal(calculateUvpScore('strong'), 100)
  assert.equal(calculateUvpScore('partial'), 50)
  assert.equal(calculateUvpScore('none'), 0)
})

test('levelScore maps every evidence level to a fixed value only', () => {
  assert.equal(levelScore('strong'), 100)
  assert.equal(levelScore('partial'), 50)
  assert.equal(levelScore('none'), 0)
})

// ---------------------------------------------------------------------------
// Expanded scorecard: the three category functions that replace the old
// single coarse judgment per category. Point weights are asserted directly
// here (20/10/10, 15/10/5/5, 10/5/5/5) so a future change to the rubric's
// weighting shows up as a failing test in one place, independent of the
// full normalizeAnalysis pipeline.
// ---------------------------------------------------------------------------

test('calculateEvidenceAbilityScore: all strong subcriteria score 100, all none score 0', () => {
  assert.equal(
    calculateEvidenceAbilityScore({ appliedEvidence: 'strong', appliedSkill: 'strong', results: 'strong' }),
    100,
  )
  assert.equal(calculateEvidenceAbilityScore({ appliedEvidence: 'none', appliedSkill: 'none', results: 'none' }), 0)
})

// Projects carry 20 of the category's 40 points (half), applied skills and
// results 10 each (a quarter each) — a strong project alone, with the other
// two subcriteria at none, should land at exactly half credit.
test('calculateEvidenceAbilityScore weights projects at half the category, applied skills and results a quarter each', () => {
  const appliedEvidenceOnly = calculateEvidenceAbilityScore({ appliedEvidence: 'strong', appliedSkill: 'none', results: 'none' })
  const appliedSkillOnly = calculateEvidenceAbilityScore({ appliedEvidence: 'none', appliedSkill: 'strong', results: 'none' })
  const resultsOnly = calculateEvidenceAbilityScore({ appliedEvidence: 'none', appliedSkill: 'none', results: 'strong' })
  assert.equal(appliedEvidenceOnly, 50)
  assert.equal(appliedSkillOnly, 25)
  assert.equal(resultsOnly, 25)
})

// A candidate with strong personal/academic/freelance project evidence but
// no formal employment must be able to reach full marks here — this
// category has no requirement-matrix or employment-history input at all.
test('calculateEvidenceAbilityScore reaches full marks from project evidence alone, with no employment history involved', () => {
  assert.equal(
    calculateEvidenceAbilityScore({ appliedEvidence: 'strong', appliedSkill: 'strong', results: 'strong' }),
    100,
  )
})

test('calculateCapabilityScore: essential skills (15/35) blends with the three holistic subcriteria (10/5/5)', () => {
  const requirements = [requirement({ category: 'skills', importance: 'must_have', match_strength: 'strong' })]
  const allStrong = calculateCapabilityScore(requirements, {
    skillApplication: 'strong',
    tools: 'strong',
    certifications: 'strong',
  })
  const allNone = calculateCapabilityScore(requirements.map((r) => ({ ...r, match_strength: 'none' as const })), {
    skillApplication: 'none',
    tools: 'none',
    certifications: 'none',
  })
  assert.equal(allStrong, 100)
  assert.equal(allNone, 0)
})

// Essential skills is 15 of 35 points (~43%); certifications support the
// evaluation but must not replace practical evidence, so alone it can only
// contribute its own 5/35 share (~14%), never dominate the category.
test('calculateCapabilityScore never lets certifications alone dominate the category', () => {
  const noEssentialSkills = [requirement({ category: 'skills', importance: 'must_have', match_strength: 'none' })]
  const certsOnly = calculateCapabilityScore(noEssentialSkills, {
    skillApplication: 'none',
    tools: 'none',
    certifications: 'strong',
  })
  assert.ok(certsOnly < 20)
})

test('calculateFitCommunicationScore: all strong subcriteria score 100, all none score 0', () => {
  assert.equal(
    calculateFitCommunicationScore({
      roleFit: 'strong',
      valueProposition: 'strong',
      technicalCommunication: 'strong',
      cvStructure: 'strong',
    }),
    100,
  )
  assert.equal(
    calculateFitCommunicationScore({
      roleFit: 'none',
      valueProposition: 'none',
      technicalCommunication: 'none',
      cvStructure: 'none',
    }),
    0,
  )
})

// Confirms the exact point weights (10/5/5/5) rather than just the extremes:
// role fit alone (strong) should score 40 (10/25), each of the other three
// alone (strong) should score 20 (5/25).
test('calculateFitCommunicationScore weights role fit at 10 points and the other three at 5 each', () => {
  const roleFitOnly = calculateFitCommunicationScore({
    roleFit: 'strong',
    valueProposition: 'none',
    technicalCommunication: 'none',
    cvStructure: 'none',
  })
  const cvStructureOnly = calculateFitCommunicationScore({
    roleFit: 'none',
    valueProposition: 'none',
    technicalCommunication: 'none',
    cvStructure: 'strong',
  })
  assert.equal(roleFitOnly, 40)
  assert.equal(cvStructureOnly, 20)
})

// The full scorecard's point weights (40 + 35 + 25) must sum to exactly
// 100, and each category's own subcriteria must sum to that category's
// share — the arithmetic invariant the scoring architecture depends on.
test('the scorecard subcriteria total exactly 100 points across all three categories', () => {
  const category1Total = CATEGORY_1_POINTS.appliedEvidence + CATEGORY_1_POINTS.appliedSkill + CATEGORY_1_POINTS.results
  const category2Total =
    CATEGORY_2_POINTS.essentialSkills + CATEGORY_2_POINTS.skillApplication + CATEGORY_2_POINTS.tools + CATEGORY_2_POINTS.certifications
  const category3Total =
    CATEGORY_3_POINTS.roleFit + CATEGORY_3_POINTS.valueProposition + CATEGORY_3_POINTS.technicalCommunication + CATEGORY_3_POINTS.cvStructure
  assert.equal(category1Total, 40)
  assert.equal(category2Total, 35)
  assert.equal(category3Total, 25)
  assert.equal(category1Total + category2Total + category3Total, 100)
})

// TEST 11 / 12 — no requirements extracted for a category: documented neutral
// fallback, never a divide by zero.
test('calculateCategoryScore falls back to a neutral 50 when no requirements exist for that category (no divide by zero)', () => {
  const reqs = [requirement({ requirement: 'Requirement 8', category: 'skills' })]
  assert.equal(calculateCategoryScore(reqs, 'experience'), 50)
})

test('calculateCategoryScore falls back to a neutral 50 when the skills category is empty', () => {
  const reqs = [requirement({ requirement: 'Requirement 9', category: 'experience' })]
  assert.equal(calculateCategoryScore(reqs, 'skills'), 50)
})

// ---------------------------------------------------------------------------
// TEST 4 / 5 — critical must-have cap
// ---------------------------------------------------------------------------

test('applyCriticalGapCap caps the score at 49 when a critical must_have has no match', () => {
  const reqs = [requirement({ requirement: 'Requirement 10', importance: 'must_have', critical: true, match_strength: 'none' })]
  assert.equal(applyCriticalGapCap(90, reqs), 49)
})

test('applyCriticalGapCap never raises a score, only lowers or leaves it', () => {
  const reqs = [requirement({ requirement: 'Requirement 11', importance: 'must_have', critical: true, match_strength: 'none' })]
  assert.equal(applyCriticalGapCap(30, reqs), 30)
})

test('applyCriticalGapCap does not trigger for a normal missing must_have (critical=false)', () => {
  const reqs = [requirement({ requirement: 'Requirement 12', importance: 'must_have', critical: false, match_strength: 'none' })]
  assert.equal(applyCriticalGapCap(72, reqs), 72)
})

test('applyCriticalGapCap does not trigger for a critical requirement that is only partially matched', () => {
  const reqs = [requirement({ requirement: 'Requirement 13', importance: 'must_have', critical: true, match_strength: 'partial' })]
  assert.equal(applyCriticalGapCap(72, reqs), 72)
})

// ---------------------------------------------------------------------------
// Evidence grounding — source-anchored excerpt check + specific-fact checks
// (guards against a fabricated but plausible sounding quote). Cases A-H
// mirror the validation brief exactly, run against the real isGroundedInCv.
// ---------------------------------------------------------------------------

test('A. Exact evidence: identical excerpt passes (source anchored)', () => {
  const cv = 'Managed supplier relationships across Ghana, Liberia, Nigeria and Sierra Leone.'
  assert.ok(isGroundedInCv(cv, cv))
})

test('B. Paraphrase using different vocabulary is not itself accepted (source anchoring is the fix, not paraphrase leniency)', () => {
  const cv = 'Managed supplier relationships across Ghana, Liberia, Nigeria and Sierra Leone.'
  // "West African" is not in the CV — correctly rejected. The system solves
  // the false negative by having the model quote the CV directly (see the
  // next test), not by teaching the checker that "West Africa" ~= "Ghana,
  // Liberia, Nigeria, Sierra Leone" — that would be exactly the complex
  // semantic similarity system the brief says not to build.
  assert.ok(!isGroundedInCv('Managed suppliers across four West African markets.', cv))
})

test('B (resolved). The same fact, quoted verbatim from the CV, passes', () => {
  const cv = 'Managed supplier relationships across Ghana, Liberia, Nigeria and Sierra Leone.'
  assert.ok(isGroundedInCv(cv, cv))
})

test('C. Fabricated metric is rejected even though the sentence shares real words', () => {
  const cv = 'Managed supplier relationships.'
  assert.ok(!isGroundedInCv('Reduced supplier costs by 25% across four countries.', cv))
})

test('D. Unsupported Odoo inference is rejected (named entity not in CV)', () => {
  const cv = 'Purchasing and Logistics Officer.'
  assert.ok(!isGroundedInCv('Managed Odoo purchase orders.', cv))
})

test('E. Short legitimate evidence is not falsely rejected', () => {
  assert.ok(isGroundedInCv('Odoo', 'Odoo ERP'))
})

test('F. MANDATORY REGRESSION: fabricated $10M revenue riding on real overlapping vocabulary is rejected', () => {
  const cv =
    'Managed digital marketing campaigns and budgets for enterprise clients, coordinating a regional team across three markets.'
  const evidence =
    'Managed enterprise marketing campaign budgets and regional team coordination generating ten million dollars in annual revenue.'
  assert.ok(!isGroundedInCv(evidence, cv))
})

test('G. Near-identical valid wording passes via the secondary overlap fallback (no invented facts)', () => {
  const cv = 'Led cross functional engineering teams to deliver enterprise software releases on schedule.'
  const evidence = 'Led cross functional engineering teams delivering enterprise software releases.'
  assert.ok(isGroundedInCv(evidence, cv))
})

test('H. Named-country paraphrase of a regional term is not itself accepted (same resolution as B)', () => {
  const cv = 'Built and maintained relationships with vendors across the Benelux region.'
  const evidence = 'Managed vendor relationships throughout the Netherlands, Belgium and Luxembourg.'
  assert.ok(!isGroundedInCv(evidence, cv))
})

test('H (resolved). The same fact, quoted verbatim from the CV, passes', () => {
  const cv = 'Built and maintained relationships with vendors across the Benelux region.'
  assert.ok(isGroundedInCv(cv, cv))
})

test('isSourceAnchored tolerates punctuation and casing differences (not brittle exact-string equality)', () => {
  const cv = 'Managed supplier relationships across Ghana, Liberia, Nigeria and Sierra Leone.'
  assert.ok(isGroundedInCv('MANAGED SUPPLIER RELATIONSHIPS ACROSS GHANA LIBERIA NIGERIA AND SIERRA LEONE', cv))
})

// --- Specific-fact tests (percentage / currency / tool / qualification) ---

test('Percentage invention is rejected', () => {
  assert.ok(!isGroundedInCv('Increased sales by 30%.', 'Increased sales.'))
})

test('Valid percentage (present in the CV) passes', () => {
  const cv = 'Increased sales by 30%.'
  assert.ok(isGroundedInCv(cv, cv))
})

test('Currency invention is rejected', () => {
  assert.ok(!isGroundedInCv('Managed a €5M regional budget.', 'Managed a regional budget.'))
})

test('Valid currency (present in the CV) passes', () => {
  const cv = 'Managed a €5M regional budget.'
  assert.ok(isGroundedInCv(cv, cv))
})

test('extractQuantifiedClaims treats "15 percent" and "15%" as the same claim', () => {
  assert.deepEqual(extractQuantifiedClaims('grew by 15 percent'), new Set(['15%']))
  assert.deepEqual(extractQuantifiedClaims('grew by 15%'), new Set(['15%']))
})

test('extractQuantifiedClaims treats "€1.5 million" and "€1.5M" as the same claim', () => {
  assert.deepEqual(extractQuantifiedClaims('a budget of €1.5 million'), new Set(['€1.5m']))
  assert.deepEqual(extractQuantifiedClaims('a budget of €1.5M'), new Set(['€1.5m']))
})

test('Tool invention is rejected: Odoo is not evidenced by generic ERP language', () => {
  assert.ok(!isGroundedInCv('Used Odoo.', 'Used ERP systems.'))
})

test('Valid tool: Odoo evidenced because the CV itself names it', () => {
  const cv = 'Used Odoo for purchasing.'
  assert.ok(isGroundedInCv('Used Odoo.', cv))
})

test('Qualification invention is rejected: PMP not evidenced anywhere in the CV', () => {
  assert.ok(!isGroundedInCv('PMP certified project manager.', 'Experienced project manager with a strong delivery record.'))
})

test('hasUnsupportedNamedEntity does not flag ordinary sentence-initial capitalization', () => {
  // "Managed" is only capitalized because it starts the sentence, not because it's a proper noun.
  assert.ok(!hasUnsupportedNamedEntity('Managed a small team.', 'Ran a small team on a daily basis.'))
})

test('hasUnsupportedNamedEntity flags a sentence-initial acronym (position independent)', () => {
  assert.ok(hasUnsupportedNamedEntity('PMP certified project manager.', 'Experienced project manager.'))
})

test('transferable evidence example: quoting the CV\'s actual (different) tool is grounded, classification is a separate decision', () => {
  // JD requirement is Odoo; CV only shows SAP. The evidence must quote what
  // the CV actually says — match_strength (e.g. partial) is where
  // transferability gets decided, never inside the evidence text itself.
  const cv = 'Used SAP for purchase order processing.'
  assert.ok(isGroundedInCv('Used SAP for purchase order processing.', cv))
  // The unacceptable version — evidence claiming Odoo when the CV says SAP — is rejected.
  assert.ok(!isGroundedInCv('Used Odoo for purchase order processing.', cv))
})

// ---------------------------------------------------------------------------
// Requirement cap (guards against an over-fragmented matrix skewing weights)
// ---------------------------------------------------------------------------

test('capRequirements leaves a matrix at or under the limit untouched', () => {
  const reqs = [requirement({ requirement: 'A' }), requirement({ requirement: 'B' })]
  assert.equal(capRequirements(reqs).length, 2)
})

test('capRequirements keeps the highest importance tiers first when oversized', () => {
  const mustHaves = Array.from({ length: 3 }, (_, i) => requirement({ requirement: `must ${i}`, importance: 'must_have' }))
  const niceToHaves = Array.from({ length: 22 }, (_, i) => requirement({ requirement: `nice ${i}`, importance: 'nice_to_have' }))
  const capped = capRequirements([...niceToHaves, ...mustHaves])
  assert.equal(capped.length, 20)
  assert.ok(mustHaves.every((m) => capped.includes(m)))
})

// ---------------------------------------------------------------------------
// normalizeAnalysis: end to end deterministic scoring
// ---------------------------------------------------------------------------

// TEST 1 — strong candidate. Every subcriterion (requirement matrix, UVP,
// and all 8 new holistic scorecard fields) is explicitly set to 'strong' —
// literally "across the board" — so every category should land at 100.
test('normalizeAnalysis: strong matches across the board produce a high score', () => {
  const result = analyze({
    requirements: [
      requirement({ requirement: 'Requirement 14', category: 'experience', importance: 'must_have', match_strength: 'strong' }),
      requirement({ requirement: 'Requirement 15', category: 'experience', importance: 'important', match_strength: 'strong' }),
      requirement({ requirement: 'Requirement 16', category: 'skills', importance: 'must_have', match_strength: 'strong' }),
      requirement({ requirement: 'Requirement 17', category: 'skills', importance: 'important', match_strength: 'strong' }),
    ],
    uvp_evidence_level: 'strong',
    uvp_evidence: 'Grew the flagship product from zero to a documented multi million dollar revenue line.',
    ...subcriteriaDefaults('strong'),
  })
  assert.equal(result.experience_score, 100)
  assert.equal(result.skills_score, 100)
  assert.equal(result.uvp_score, 100)
  assert.equal(result.interview_probability_score, 100)
  assert.equal(getScoreLabel(result.interview_probability_score), 'Likely Interview Candidate')
  assert.deepEqual(result.improvements, [])
  assert.match(result.prospects[0], /complete documented alignment/i)
})

// TEST 2 — partial candidate. Mixed JD requirement matches plus a genuinely
// mixed set of the new holistic subcriteria (some strong, some only
// partial) — a realistic "solid but uneven" application, not a single
// dimension carrying the whole verdict.
test('normalizeAnalysis: a mix of strong/partial/none lands in Needs Improvement', () => {
  const result = analyze({
    requirements: [
      requirement({ requirement: 'Requirement 18', category: 'experience', importance: 'must_have', match_strength: 'partial' }),
      requirement({ requirement: 'Requirement 19', category: 'experience', importance: 'important', match_strength: 'strong' }),
      requirement({ requirement: 'Requirement 20', category: 'skills', importance: 'must_have', match_strength: 'partial' }),
      requirement({ requirement: 'Requirement 21', category: 'skills', importance: 'nice_to_have', match_strength: 'none' }),
    ],
    uvp_evidence_level: 'partial',
    ...subcriteriaDefaults('strong'),
    skill_application_evidence_level: 'partial',
    tools_platforms_evidence_level: 'partial',
    certifications_evidence_level: 'partial',
  })
  const label = getScoreLabel(result.interview_probability_score)
  assert.equal(label, 'Needs Improvement')
  assert.equal(result.improvements.length, 3)
  assert.ok(result.improvements.every((item) => /Example:/i.test(item)))
})

test('normalizeAnalysis deterministically completes three Needs Improvement items when the model returns only two', () => {
  const result = analyze({
    requirements: [
      requirement({ requirement: 'Relevant experience', category: 'experience', importance: 'must_have', match_strength: 'strong' }),
      requirement({ requirement: 'Stakeholder management', category: 'skills', importance: 'important', match_strength: 'partial' }),
      requirement({ requirement: 'Reporting tools', category: 'skills', importance: 'nice_to_have', match_strength: 'none', cv_evidence: '' }),
    ],
    uvp_evidence_level: 'partial',
    ...subcriteriaDefaults('strong'),
    skill_application_evidence_level: 'partial',
    tools_platforms_evidence_level: 'partial',
    certifications_evidence_level: 'partial',
    improvement_3_finding: '',
    improvement_3_evidence: '',
    improvement_3_example: '',
  })
  assert.equal(getScoreLabel(result.interview_probability_score), 'Needs Improvement')
  assert.equal(result.improvements.length, 3)
  assert.ok(result.improvements.every((item) => /Example:/i.test(item)))
})

// TEST 3 — poor candidate
test('normalizeAnalysis: most important requirements unmatched lands in Not a Fit', () => {
  const result = analyze({
    requirements: [
      requirement({ requirement: 'Requirement 22', category: 'experience', importance: 'must_have', match_strength: 'none' }),
      requirement({ requirement: 'Requirement 23', category: 'experience', importance: 'important', match_strength: 'none' }),
      requirement({ requirement: 'Requirement 24', category: 'skills', importance: 'must_have', match_strength: 'none' }),
      requirement({ requirement: 'Requirement 25', category: 'skills', importance: 'important', match_strength: 'partial' }),
    ],
    uvp_evidence_level: 'none',
    uvp_evidence: '',
  })
  assert.equal(getScoreLabel(result.interview_probability_score), 'Not a Fit')
})

test('normalizeAnalysis keeps Not a Fit prospects consistent with the score', () => {
  const result = analyze({
    requirements: [
      requirement({ category: 'experience', importance: 'must_have', match_strength: 'none', cv_evidence: '' }),
      requirement({ category: 'skills', importance: 'must_have', match_strength: 'none', cv_evidence: '' }),
    ],
    uvp_evidence_level: 'none',
    uvp_evidence: '',
    prospect_1: 'You are a competitive candidate for this role.',
  })
  assert.equal(getScoreLabel(result.interview_probability_score), 'Not a Fit')
  assert.match(result.prospects[0], /does not yet show enough evidence/i)
  assert.doesNotMatch(result.prospects.join(' '), /competitive candidate/i)
})

test('normalizeAnalysis excludes BSN requirements from scoring and removes unsafe BSN advice', () => {
  const result = analyze({
    requirements: [
      requirement({ requirement: 'BSN and work permit required', category: 'skills', importance: 'must_have', critical: true, match_strength: 'none', cv_evidence: '' }),
      requirement({ requirement: 'Customer service', category: 'skills', importance: 'important', match_strength: 'strong' }),
    ],
    // Full marks on the other three capability subcriteria isolates this
    // assertion to exactly what it's testing: BSN exclusion from the
    // essential skills match, not an incidental blend with unrelated fields.
    ...subcriteriaDefaults('strong'),
    improvement_1_finding: 'Include BSN and work permit status',
    improvement_1_evidence: 'Your CV does not mention your BSN or work permit status.',
    improvement_1_example: 'Clearly state your BSN and work permit status in your application.',
  })
  assert.equal(result.skills_score, 100)
  assert.match(result.improvements[0], /Authorized to work in the Netherlands/i)
  assert.doesNotMatch(result.improvements[0], /include your BSN/i)
  assert.match(result.improvements[0], /Never include a BSN or permit number/i)
})

test('normalizeAnalysis excludes other private and post hire identifiers from scoring', () => {
  const result = analyze({
    requirements: [
      requirement({ requirement: 'Passport number required', category: 'skills', importance: 'must_have', critical: true, match_strength: 'none', cv_evidence: '' }),
      requirement({ requirement: 'Customer service', category: 'skills', importance: 'important', match_strength: 'strong' }),
    ],
    ...subcriteriaDefaults('strong'),
  })
  assert.equal(result.skills_score, 100)
})

test('normalizeAnalysis treats non mandatory availability as an application clarification, not a critical gap', () => {
  const result = analyze({
    requirements: [
      requirement({ requirement: 'Weekend shift availability', category: 'skills', importance: 'important', critical: true, match_strength: 'none', cv_evidence: '' }),
      requirement({ requirement: 'Customer service', category: 'skills', importance: 'must_have', match_strength: 'strong' }),
    ],
    // Everything else strong: isolates this to "does a non-mandatory
    // availability gap wrongly trigger the critical cap", not an incidental
    // low score from unrelated dimensions defaulting to 'none'.
    ...subcriteriaDefaults('strong'),
    improvement_1_finding: 'Add weekend availability',
    improvement_1_evidence: 'The application does not confirm your availability for weekend shifts.',
    improvement_1_example: '',
  })
  assert.ok(result.interview_probability_score > 49)
  assert.match(result.improvements[0], /application form or recruiter message/i)
})

test('normalizeAnalysis keeps an explicitly mandatory professional licence critical', () => {
  const result = analyze({
    requirements: [
      requirement({ requirement: 'Mandatory commercial pilot licence', category: 'skills', importance: 'must_have', critical: true, match_strength: 'none', cv_evidence: '' }),
      requirement({ requirement: 'Customer service', category: 'skills', importance: 'important', match_strength: 'strong' }),
    ],
    // Everything else strong, so the raw weighted score would be high —
    // demonstrating the critical cap is what forces this down to 49, not a
    // coincidentally low score from other unrelated fields.
    ...subcriteriaDefaults('strong'),
  })
  assert.equal(result.interview_probability_score, 49)
  assert.equal(getScoreLabel(result.interview_probability_score), 'Not a Fit')
  assert.match(result.prospects[0], /commercial pilot licence/i)
  assert.doesNotMatch(result.prospects.join(' '), /competitive candidate/i)
})

test('normalizeAnalysis keeps likely candidate prospects positive but conditional', () => {
  const result = analyze({
    requirements: [
      requirement({ requirement: 'Customer service', category: 'experience', importance: 'must_have', match_strength: 'strong' }),
      requirement({ requirement: 'Hospitality operations', category: 'skills', importance: 'must_have', match_strength: 'strong' }),
    ],
    uvp_evidence_level: 'partial',
    uvp_evidence: 'Delivered documented, employer relevant differentiation through repeated successful launches.',
    ...subcriteriaDefaults('strong'),
  })
  assert.equal(getScoreLabel(result.interview_probability_score), 'Likely Interview Candidate')
  assert.match(result.prospects[0], /strong documented evidence/i)
})

// TEST 4 — critical requirement missing overrides an otherwise passing score
test('normalizeAnalysis: a missing critical must_have caps the final score at 49 even when the raw weighted score is higher', () => {
  const result = analyze({
    requirements: [
      requirement({
        requirement: 'Requirement 26',
        category: 'experience',
        importance: 'must_have',
        critical: true,
        match_strength: 'none',
        cv_evidence: '',
      }),
      requirement({ requirement: 'Requirement 27', category: 'experience', importance: 'important', match_strength: 'strong' }),
      requirement({ requirement: 'Requirement 28', category: 'skills', importance: 'must_have', match_strength: 'strong' }),
      requirement({ requirement: 'Requirement 29', category: 'skills', importance: 'important', match_strength: 'strong' }),
    ],
    uvp_evidence_level: 'strong',
    uvp_evidence: 'Documented, employer relevant differentiation.',
    ...subcriteriaDefaults('strong'),
  })
  assert.ok(result.interview_probability_score <= 49)
  assert.equal(getScoreLabel(result.interview_probability_score), 'Not a Fit')
})

// Precise version of the above: the raw weighted score (before the critical
// cap) is computed and asserted to be well above 49, so this confirms the
// cap is actually doing something here, not coincidentally landing low.
// Essential skills match: 'Required professional licence' (must_have,
// weight 3, none) + 'Core tool proficiency' (must_have, weight 3, strong) +
// 'Secondary tool familiarity' (important, weight 2, none) -> matched=3,
// max=8 -> round(3/8*100) = 38. Every other subcriterion is 'strong' (100),
// so skills_score = round((15*38 + 10*100 + 5*100 + 5*100) / 35) = 73, and
// experience_score / uvp_score are both 100 (all their subcriteria strong).
test('normalizeAnalysis: a high raw weighted score is capped to 49 when a critical must_have is missing', () => {
  const result = analyze({
    requirements: [
      requirement({ requirement: 'Relevant domain experience', category: 'experience', importance: 'important', match_strength: 'strong' }),
      requirement({
        requirement: 'Required professional licence',
        category: 'skills',
        importance: 'must_have',
        critical: true,
        match_strength: 'none',
        cv_evidence: '',
      }),
      requirement({ requirement: 'Core tool proficiency', category: 'skills', importance: 'must_have', match_strength: 'strong' }),
      requirement({ requirement: 'Secondary tool familiarity', category: 'skills', importance: 'important', match_strength: 'none', cv_evidence: '' }),
    ],
    uvp_evidence_level: 'strong',
    uvp_evidence: 'Documented, employer relevant differentiation.',
    ...subcriteriaDefaults('strong'),
  })
  assert.equal(result.experience_score, 100)
  assert.equal(result.skills_score, 73)
  assert.equal(result.uvp_score, 100)
  // The raw weighted score (before the cap) is well above 49 — confirm the
  // cap is actually doing something here, not just coincidentally landing low.
  const rawWeighted = Math.round(result.experience_score * 0.4 + result.skills_score * 0.35 + result.uvp_score * 0.25)
  assert.ok(rawWeighted > 49)
  assert.equal(result.interview_probability_score, 49)
  assert.equal(getScoreLabel(result.interview_probability_score), 'Not a Fit')
})

// TEST 5 — normal must-have missing, not critical. Essential skills (2a) is
// the one subcriterion still driven by the requirement matrix, so this now
// targets skills_score/'skills'-tagged requirements rather than
// experience_score, which the expanded rubric no longer derives from the
// requirement matrix at all (see the RawAnalysis comment in logic.ts).
test('normalizeAnalysis: a non critical missing must_have lowers its category score but never triggers the cap', () => {
  const result = analyze({
    requirements: [
      requirement({
        requirement: 'Requirement 30',
        category: 'skills',
        importance: 'must_have',
        critical: false,
        match_strength: 'none',
        cv_evidence: '',
      }),
      requirement({ requirement: 'Requirement 31', category: 'skills', importance: 'important', match_strength: 'strong' }),
    ],
    uvp_evidence_level: 'strong',
    ...subcriteriaDefaults('strong'),
  })
  assert.ok(result.skills_score < 100)
  // Nothing here forces a sub 50 outcome purely from a non critical gap.
  assert.notEqual(getScoreLabel(result.interview_probability_score), 'Not a Fit')
})

// TEST 6 — presentation weakness never removes fit credit. Retargeted to
// skills_score for the same reason as the test above: essential skills is
// the requirement-matrix-driven subcriterion under the expanded rubric.
test('normalizeAnalysis: an unquantified but clearly evidenced requirement keeps full match credit', () => {
  const result = analyze({
    requirements: [
      requirement({
        requirement: 'Requirement 33',
        category: 'skills',
        importance: 'must_have',
        match_strength: 'strong',
        cv_evidence: 'Managed supplier and client relationships across Ghana, Liberia, Nigeria and Sierra Leone.',
      }),
    ],
    uvp_evidence_level: 'none',
    uvp_evidence: '',
    ...subcriteriaDefaults('strong'),
  })
  assert.equal(result.skills_score, 100)
  // The "quantify your impact" theme belongs in Areas to Improve, not in a reduced score.
  assert.ok(result.improvements.some((item) => /quantify/i.test(item)))
})

// TEST 7 — no inferred skill match
test('normalizeAnalysis: a requirement the CV never mentions must be recorded as none, not inferred', () => {
  const result = analyze({
    requirements: [
      requirement({
        category: 'skills',
        requirement: 'Odoo',
        importance: 'must_have',
        match_strength: 'none',
        cv_evidence: '',
      }),
    ],
    uvp_evidence_level: 'none',
    uvp_evidence: '',
  })
  assert.equal(result.skills_score, 0)
})

test('normalizeAnalysis downgrades a strong or partial match with no supporting CV evidence', () => {
  const result = analyze({
    requirements: [requirement({ requirement: 'Requirement 35', category: 'skills', match_strength: 'strong', cv_evidence: '' })],
  })
  assert.equal(result.skills_score, 0)
})

test('normalizeAnalysis gives unsupported UVP evidence no credit', () => {
  const result = analyze({ uvp_evidence_level: 'strong', uvp_evidence: '' })
  assert.equal(result.uvp_score, 0)
})

test('normalizeAnalysis rejects an empty requirement matrix', () => {
  assert.throws(() => analyze({ requirements: [] }), /non empty requirement matrix/)
})

// Fabrication guard: a non-empty evidence field that shares nothing with the
// real CV text must still be rejected, even though it passes the earlier
// "field is non empty" check.
test('normalizeAnalysis downgrades a strong match whose evidence is not grounded in the CV text', () => {
  const result = analyze({
    requirements: [
      requirement({
        requirement: 'Locomotive licence',
        category: 'skills',
        match_strength: 'strong',
        cv_evidence: 'Certified locomotive engineer with twenty years piloting freight trains nationwide.',
      }),
    ],
  })
  assert.equal(result.skills_score, 0)
})

test('normalizeAnalysis downgrades UVP evidence that is not grounded in the CV text', () => {
  const result = analyze({
    uvp_evidence_level: 'strong',
    uvp_evidence: 'Piloted commercial aircraft across six continents for a major airline.',
  })
  assert.equal(result.uvp_score, 0)
})

test('normalizeAnalysis deduplicates exact-text duplicate requirements before scoring', () => {
  const result = analyze({
    requirements: [
      requirement({ category: 'skills', requirement: 'Node.js', importance: 'must_have', match_strength: 'none', cv_evidence: '' }),
      requirement({ category: 'skills', requirement: 'node.js ', importance: 'must_have', match_strength: 'strong' }),
    ],
  })
  // Only the first occurrence ("none") counts, so the category score reflects one requirement, not two.
  assert.equal(result.skills_score, 0)
})

test('normalizeAnalysis caps an oversized requirement matrix instead of scoring every near duplicate', () => {
  const niceToHaves = Array.from({ length: 22 }, (_, i) =>
    requirement({ category: 'skills', requirement: `nice ${i}`, importance: 'nice_to_have', match_strength: 'none', cv_evidence: '' }),
  )
  const mustHave = requirement({ category: 'skills', requirement: 'core skill', importance: 'must_have', match_strength: 'strong' })
  const result = analyze({ requirements: [...niceToHaves, mustHave], ...subcriteriaDefaults('strong') })
  // 23 total requirements capped to 20: the must_have (weight 3, matched)
  // survives the cap, plus 19 of the 22 nice_to_have (weight 1, unmatched).
  // matched = 3, max = 3 + 19*1 = 22 -> essential skills = round(3/22*100) =
  // 14. Without the cap all 22 nice_to_haves would count (max = 25 -> 12),
  // so this also confirms the cap is actually excluding entries, not a
  // no-op. skills_score blends that 14 with the other three (strong,
  // 100 each) capability subcriteria: round((15*14 + 10*100 + 5*100 +
  // 5*100) / 35) = round(2210/35) = 63.
  assert.equal(result.skills_score, 63)
})

// The old 3-bucket rubric kept UVP as its own isolated category
// specifically so strong experience/skills evidence could never leak into
// it. Under the expanded rubric, "Role fit and recruiter communication" is
// legitimately a blend of four independent subcriteria (role fit, value
// proposition, technical communication, CV structure) — a candidate can
// have a well structured, clearly communicated CV with strong role fit
// while still lacking a standout differentiating value proposition, and the
// category total should reflect that combination, not collapse to 0. What
// must still hold is narrower: the value proposition subcriterion itself
// is not inflated by strong evidence elsewhere — verified directly on
// calculateFitCommunicationScore below, where 'none' costs exactly its own
// 5/25 share of the category regardless of the other three inputs.
test('calculateFitCommunicationScore: a "none" value proposition only costs its own share of the category', () => {
  const allStrong = calculateFitCommunicationScore({
    roleFit: 'strong',
    valueProposition: 'strong',
    technicalCommunication: 'strong',
    cvStructure: 'strong',
  })
  const noValueProp = calculateFitCommunicationScore({
    roleFit: 'strong',
    valueProposition: 'none',
    technicalCommunication: 'strong',
    cvStructure: 'strong',
  })
  assert.equal(allStrong, 100)
  // Losing only the 5-point value proposition slot out of 25 total costs
  // exactly 20 points (100 -> 80), not the whole category.
  assert.equal(noValueProp, 80)
})

// ---------------------------------------------------------------------------
// score_breakdown: rubric/prompt versioning, and validation before storage
// ---------------------------------------------------------------------------

function validBreakdown(): ScoreBreakdown {
  const result = analyze({ ...subcriteriaDefaults('strong'), uvp_evidence_level: 'strong' })
  return result.score_breakdown
}

test('normalizeAnalysis stamps the current rubric and prompt version onto every breakdown', () => {
  const result = analyze()
  assert.equal(result.score_breakdown.rubric_version, RUBRIC_VERSION)
  assert.equal(result.score_breakdown.prompt_version, PROMPT_VERSION)
  assert.equal(RUBRIC_VERSION, 'early_career_tech_v1')
})

// Every subcriterion classification traces back to an explicit field the
// model returned (see the RawAnalysis -> evidenceSafe*Level -> breakdown
// chain in normalizeAnalysis) — this is the one label that says so, and
// validateScoreBreakdown refuses anything else. There is no code path left
// that can produce a "detailed_rubric" breakdown without a real,
// schema-validated AI response behind it, since the last-resort fallback
// that used to fabricate one has been removed entirely (see index.ts).
test('every breakdown is explicitly labeled detailed_rubric, never left ambiguous with a legacy/fallback result', () => {
  const result = analyze()
  assert.equal(result.score_breakdown.scoring_method, 'detailed_rubric')
})

test('normalizeAnalysis stamps the model identifier from the AI response when available, null otherwise', () => {
  const withModel = analyze({}, CV_TEXT).score_breakdown.model
  assert.equal(withModel, null) // analyze() doesn't pass meta, mirroring "not available"
  const raw = baseRaw()
  const withRealModel = normalizeAnalysis(raw, CV_TEXT, { model: 'gpt-4o-mini-2024-07-18' })
  assert.equal(withRealModel.score_breakdown.model, 'gpt-4o-mini-2024-07-18')
})

test('normalizeAnalysis never puts CV or job description text into a subcriterion reason', () => {
  const result = analyze({ ...subcriteriaDefaults('strong') })
  const allReasons = Object.values(result.score_breakdown.categories)
    .flatMap((c) => Object.values(c.subcriteria))
    .map((s) => s.reason)
  // GROUNDED_EVIDENCE is the fixture's stand-in "CV excerpt" used to satisfy
  // grounding checks — if it ever leaked into a reason string, that would be
  // exactly the kind of candidate-data duplication the breakdown must avoid.
  for (const reason of allReasons) {
    assert.doesNotMatch(reason, /Led a migration that reduced infrastructure cost/i)
  }
})

test('a valid score_breakdown passes validateScoreBreakdown without throwing', () => {
  assert.doesNotThrow(() => validateScoreBreakdown(validBreakdown()))
})

test('validateScoreBreakdown rejects a category subtotal that does not match its subcriteria', () => {
  const breakdown = validBreakdown()
  breakdown.categories.relevant_evidence_and_applied_ability.subtotal = 12
  assert.throws(() => validateScoreBreakdown(breakdown), /does not equal its subcriteria/)
})

test('validateScoreBreakdown rejects a subcriterion score outside its own point range', () => {
  const breakdown = validBreakdown()
  breakdown.categories.relevant_evidence_and_applied_ability.subcriteria.applied_evidence.points = 999
  assert.throws(() => validateScoreBreakdown(breakdown), /out of its own 0-\d+ range/)
})

test('validateScoreBreakdown rejects a raw_weighted_score that does not equal the three category subtotals', () => {
  const breakdown = validBreakdown()
  breakdown.raw_weighted_score = 1
  assert.throws(() => validateScoreBreakdown(breakdown), /does not equal the three category subtotals/)
})

test('validateScoreBreakdown rejects a non whole-number or out of range final_score', () => {
  const decimal = validBreakdown()
  decimal.final_score = 77.5
  assert.throws(() => validateScoreBreakdown(decimal), /whole number in 0-100/)

  const tooHigh = validBreakdown()
  tooHigh.final_score = 150
  assert.throws(() => validateScoreBreakdown(tooHigh), /whole number in 0-100/)
})

test('validateScoreBreakdown rejects final_score that silently diverges from raw_weighted_score without the cap flag', () => {
  const breakdown = validBreakdown()
  breakdown.final_score = breakdown.raw_weighted_score - 10
  assert.throws(() => validateScoreBreakdown(breakdown), /critical_gap_capped is false/)
})

test('validateScoreBreakdown accepts a capped score only when it is actually capped at or below 49', () => {
  const breakdown = validBreakdown()
  breakdown.critical_gap_capped = true
  breakdown.final_score = 49
  assert.doesNotThrow(() => validateScoreBreakdown(breakdown))

  const inconsistent = validBreakdown()
  inconsistent.critical_gap_capped = true
  inconsistent.final_score = inconsistent.raw_weighted_score // claims capped but didn't actually lower it
  assert.throws(() => validateScoreBreakdown(inconsistent), /is not actually capped/)
})

test('normalizeAnalysis rejects rather than stores a check whose critical gap cap fires with an internally inconsistent breakdown', () => {
  // The real pipeline always produces a consistent breakdown (validated
  // above end-to-end via the normal analyze() path); this test only proves
  // the validation function itself would catch the specific failure mode
  // the cap introduces if buildScoreBreakdown ever drifted from
  // applyCriticalGapCap's own logic.
  const capped = analyze({
    requirements: [
      requirement({ requirement: 'Mandatory licence', category: 'skills', importance: 'must_have', critical: true, match_strength: 'none', cv_evidence: '' }),
      requirement({ requirement: 'Customer service', category: 'skills', importance: 'important', match_strength: 'strong' }),
    ],
    ...subcriteriaDefaults('strong'),
  })
  assert.equal(capped.interview_probability_score, 49)
  assert.equal(capped.score_breakdown.critical_gap_capped, true)
  assert.ok(capped.score_breakdown.raw_weighted_score > 49)
  assert.doesNotThrow(() => validateScoreBreakdown(capped.score_breakdown))
})

// TEST 9 — deterministic arithmetic: identical input always produces identical output
test('normalizeAnalysis is deterministic: the same requirement matrix always produces the same scores', () => {
  const input = baseRaw({
    requirements: [
      requirement({ requirement: 'Requirement 38', category: 'experience', importance: 'must_have', match_strength: 'partial' }),
      requirement({ requirement: 'Requirement 39', category: 'skills', importance: 'important', match_strength: 'strong' }),
    ],
    uvp_evidence_level: 'partial',
  })
  const first = normalizeAnalysis(input, CV_TEXT)
  const second = normalizeAnalysis(input, CV_TEXT)
  // calculated_at is a real wall-clock timestamp (see buildScoreBreakdown)
  // and is expected to differ between two separate calls a moment apart —
  // strip it before comparing so this test asserts what it means to: the
  // *scoring*, not the *timestamp*, is deterministic.
  const stripTimestamp = (r: typeof first) => ({
    ...r,
    score_breakdown: { ...r.score_breakdown, calculated_at: null },
  })
  assert.deepEqual(stripTimestamp(first), stripTimestamp(second))
})

test('normalizeAnalysis rejects output that self-reports an unverified claim', () => {
  assert.throws(() => analyze({ new_claims_introduced: ['Increased revenue by 25%'] }), /unverified claims/)
})

test('normalizeAnalysis rejects non English content', () => {
  assert.throws(
    () =>
      analyze({
        strength_1_finding: 'Sterke verkoopresultaten',
        strength_1_evidence: 'Uw staat van dienst bij het overtreffen van verkoopdoelen ondersteunt deze rol.',
        strength_2_finding: 'Relevante vaardigheden',
        strength_2_evidence: 'Uw ervaring met deze specifieke tools sluit goed aan bij deze functie.',
        improvement_1_finding: 'Kwantificeer uw impact',
        improvement_1_evidence: 'Voeg conversiepercentages of behaalde omzet toe.',
        improvement_1_example: '',
        improvement_2_finding: 'Versterk bewijs van leiderschap',
        improvement_2_evidence: 'Laat zien of u een project heeft geleid of begeleid.',
        improvement_2_example: '',
        improvement_3_finding: 'Werk uw meest relevante functie verder uit',
        improvement_3_evidence: 'Voeg meer detail toe aan de functie die het dichtst bij deze rol ligt.',
        improvement_3_example: '',
        prospect_1: 'Uw achtergrond sluit redelijk goed aan bij deze functie.',
        prospect_2: 'Meetbare resultaten toevoegen verhoogt uw kansen het meest.',
      }),
    /did not look like English/,
  )
})

// ---------------------------------------------------------------------------
// TEST 8 — exact score band boundaries
// ---------------------------------------------------------------------------

test('getScoreLabel: exact score band boundaries have no gaps or overlaps', () => {
  assert.equal(getScoreLabel(0), 'Not a Fit')
  assert.equal(getScoreLabel(60), 'Not a Fit')
  assert.equal(getScoreLabel(61), 'Needs Improvement')
  assert.equal(getScoreLabel(84), 'Needs Improvement')
  assert.equal(getScoreLabel(85), 'Likely Interview Candidate')
  assert.equal(getScoreLabel(100), 'Likely Interview Candidate')
})

// getScoreLabel has no clamp of its own — every caller already passes a
// score produced by clampScore (0-100) in logic.ts, so this just documents
// that out-of-range input degrades predictably rather than throwing, without
// introducing a second, contradictory clamp inside getScoreLabel itself.
test('getScoreLabel degrades predictably for out-of-range input without its own clamp', () => {
  assert.equal(getScoreLabel(-5), 'Not a Fit')
  assert.equal(getScoreLabel(105), 'Likely Interview Candidate')
})

// ---------------------------------------------------------------------------
// toAuditRecord: the exact reshaping analyze-check/index.ts sends to the
// private check_score_audits table via complete_check_analysis_with_audit.
// ---------------------------------------------------------------------------

test('toAuditRecord flattens all 11 subcriteria and all 3 category totals, preserving every value', () => {
  const result = analyze({ ...subcriteriaDefaults('strong'), uvp_evidence_level: 'strong' })
  const breakdown = result.score_breakdown
  const record = toAuditRecord(breakdown, result.evidence_references)

  assert.equal(Object.keys(record.subcriteria).length, 11)
  assert.equal(Object.keys(record.category_totals).length, 3)
  assert.equal(Object.keys(record.evidence_references).length, 5)
  assert.equal(record.rubric_version, breakdown.rubric_version)
  assert.equal(record.prompt_version, breakdown.prompt_version)
  assert.equal(record.model_identifier, breakdown.model)
  assert.equal(record.scoring_method, breakdown.scoring_method)
  assert.equal(record.final_score, breakdown.final_score)
  assert.equal(record.calculated_at, breakdown.calculated_at)

  // Spot check one subcriterion end to end and one category total, rather
  // than just counting keys.
  assert.deepEqual(
    record.subcriteria.applied_evidence,
    breakdown.categories.relevant_evidence_and_applied_ability.subcriteria.applied_evidence,
  )
  assert.deepEqual(record.category_totals.relevant_evidence_and_applied_ability, {
    subtotal: breakdown.categories.relevant_evidence_and_applied_ability.subtotal,
    max_points: breakdown.categories.relevant_evidence_and_applied_ability.max_points,
  })
})

// ---------------------------------------------------------------------------
// withRetry: the retry mechanism analyze-check/index.ts's generateFeedback
// uses around the real OpenAI call. Tested here as a generic, network-free
// function (mocking the "attempt" closure) since the real call lives in
// index.ts, which can't be imported outside Deno (see the file header
// comment) — this is the same reason logic.ts exists as a separate module.
// ---------------------------------------------------------------------------

// The correction-prompt mechanism (callOpenAI's correctionNote parameter)
// depends entirely on withRetry actually threading the previous failure's
// message into the next attempt — this proves that wiring works, independent
// of the Deno-only HTTP call that consumes it.
await testAsync('withRetry passes the exact previous attempt\'s error message into the next attempt', () => {
  const seen: (string | null)[] = []
  return withRetry(async (previousError) => {
    seen.push(previousError)
    if (seen.length < 2) throw new Error('Missing or invalid uvp_evidence_level')
    return 'ok'
  }, 2).then((result) => {
    assert.deepEqual(seen, [null, 'Missing or invalid uvp_evidence_level'])
    assert.equal(result, 'ok')
  })
})

await testAsync('withRetry returns the first successful attempt without retrying', async () => {
  let calls = 0
  const result = await withRetry(async () => {
    calls += 1
    return 'ok'
  }, 2)
  assert.equal(result, 'ok')
  assert.equal(calls, 1)
})

// "Invalid AI output": simulates the real failure mode — normalizeAnalysis
// itself throwing on a malformed/inconsistent raw response — inside the
// retry wrapper, exactly as generateFeedback's real closure does.
await testAsync('withRetry: invalid AI output on the first attempt, valid on the second, succeeds (retry success)', async () => {
  let calls = 0
  const result = await withRetry(async () => {
    calls += 1
    if (calls === 1) {
      // Same call normalizeAnalysis's own validation would throw for real
      // malformed output — an empty requirement matrix.
      return normalizeAnalysis(baseRaw({ requirements: [] }), CV_TEXT)
    }
    return normalizeAnalysis(baseRaw(), CV_TEXT)
  }, 2)
  assert.equal(calls, 2)
  assert.ok(result.score_breakdown)
})

await testAsync('withRetry: invalid AI output on both attempts fails safely after exactly 2 tries, never a 3rd', async () => {
  let calls = 0
  await assert.rejects(
    () =>
      withRetry(async () => {
        calls += 1
        return normalizeAnalysis(baseRaw({ requirements: [] }), CV_TEXT)
      }, 2),
    /All 2 attempts failed/,
  )
  assert.equal(calls, 2)
})

// A request timeout surfaces to withRetry as a rejected promise like any
// other failure (fetchWithTimeout in index.ts throws a plain Error when the
// AbortController fires) — this confirms it's retried the same way, not
// treated as a special case that skips the retry or the safe-fail path.
await testAsync('withRetry treats a timeout-shaped failure the same as any other error', async () => {
  let calls = 0
  const result = await withRetry(async () => {
    calls += 1
    if (calls === 1) throw new Error('OpenAI request timed out after 45000ms')
    return 'recovered'
  }, 2)
  assert.equal(result, 'recovered')
  assert.equal(calls, 2)
})

await testAsync('withRetry aggregates every attempt\'s error message, including a timeout, into the final failure', async () => {
  await assert.rejects(
    () =>
      withRetry(async () => {
        throw new Error('OpenAI request timed out after 45000ms')
      }, 2),
    (error: unknown) => error instanceof Error && (error.message.match(/timed out/g) ?? []).length === 2,
  )
})

// ---------------------------------------------------------------------------
// Evidence dependent classification invariants (Persona 7 fix): a bare
// skills list, keyword list, or summary claim must never independently earn
// a "strong" or "partial" rating on applied_evidence, applied_skill,
// skill_application, or results — and never "strong" on tools_platforms.
// See resolveEvidenceDependentClassification in logic.ts.
// ---------------------------------------------------------------------------

// Adversarial fixture 1: a long keyword stuffed skills list with no work or
// projects at all — this is the exact shape that produced the confirmed
// false positive (score 77, four subcriteria wrongly "strong") before this
// fix, reproduced identically across 3 live runs against the real model.
test('ADVERSARIAL 1: a keyword stuffed skills list with no work rejects a strong applied_evidence classification', () => {
  assert.throws(
    () =>
      analyze({
        ...subcriteriaDefaults('none'),
        applied_evidence_level: 'strong',
        applied_evidence: GROUNDED_EVIDENCE,
        applied_evidence_reference: listedOnlyReference(),
      }),
    /applied_evidence.*"strong".*listed only/i,
  )
})

test('ADVERSARIAL 1b: the same keyword list also rejects "partial" for applied_skill (not just "strong")', () => {
  assert.throws(
    () =>
      analyze({
        ...subcriteriaDefaults('none'),
        applied_skill_evidence_level: 'partial',
        applied_skill_evidence: GROUNDED_EVIDENCE,
        applied_skill_reference: listedOnlyReference(),
      }),
    /applied_skill.*"partial".*listed only/i,
  )
})

// Adversarial fixture 2: a polished professional summary claiming expertise
// ("results driven data professional skilled in...") with no supporting
// entries anywhere else in the CV — the summary section is just as much a
// "listed, not demonstrated" location as a skills list.
test('ADVERSARIAL 2: a summary-only claim rejects a strong results classification', () => {
  assert.throws(
    () =>
      analyze({
        ...subcriteriaDefaults('none'),
        results_evidence_level: 'strong',
        results_evidence: GROUNDED_EVIDENCE,
        results_reference: { cv_section: 'summary', entry_reference: 'Summary', evidence_basis: 'Results driven professional.', evidence_type: 'employment' },
      }),
    /results.*"strong".*listed only/i,
  )
})

// Adversarial fixture 3: tools listed in a skills section only. Per the
// calibration rules, this is the one narrow case that may still earn
// "partial" for claimed familiarity — but never "strong".
test('ADVERSARIAL 3: a tool named only in a skills list can earn partial but never strong', () => {
  const partialResult = analyze({
    ...subcriteriaDefaults('none'),
    tools_platforms_evidence_level: 'partial',
    tools_platforms_evidence: GROUNDED_EVIDENCE,
    tools_platforms_reference: listedOnlyReference(),
  })
  assert.equal(partialResult.evidence_references.tools_platforms.cv_section, 'skills')

  assert.throws(
    () =>
      analyze({
        ...subcriteriaDefaults('none'),
        tools_platforms_evidence_level: 'strong',
        tools_platforms_evidence: GROUNDED_EVIDENCE,
        tools_platforms_reference: listedOnlyReference(),
      }),
    /tools_platforms.*"strong".*listed only/i,
  )
})

// Adversarial fixture 4: one relevant tool used in a specific academic task
// (a demonstrating section, evidence_type "academic") — this is genuine
// demonstrated evidence and must be accepted at "strong", never penalized
// for lacking paid employment.
test('ADVERSARIAL 4: a tool demonstrated in a specific academic task earns strong tools_platforms', () => {
  const result = analyze({
    ...subcriteriaDefaults('none'),
    tools_platforms_evidence_level: 'strong',
    tools_platforms_evidence: GROUNDED_EVIDENCE,
    tools_platforms_reference: { cv_section: 'education', entry_reference: 'Coursework: Data Analysis', evidence_basis: 'Used Tableau to build a dashboard for a class project.', evidence_type: 'academic' },
  })
  assert.equal(result.score_breakdown.categories.technical_and_role_specific_capability.subcriteria.tools_platforms.level, 'strong')
})

// Adversarial fixture 5: several relevant tools used in a deployed project —
// full credit expected, no employment required.
test('ADVERSARIAL 5: several tools used in a deployed project earn strong applied_evidence and tools_platforms', () => {
  const result = analyze({
    ...subcriteriaDefaults('none'),
    applied_evidence_level: 'strong',
    applied_evidence: GROUNDED_EVIDENCE,
    applied_evidence_reference: { cv_section: 'projects', entry_reference: 'Project: Deployed App', evidence_basis: 'Designed and deployed a full stack app end to end.', evidence_type: 'project' },
    tools_platforms_evidence_level: 'strong',
    tools_platforms_evidence: GROUNDED_EVIDENCE,
    tools_platforms_reference: { cv_section: 'projects', entry_reference: 'Project: Deployed App', evidence_basis: 'Used Docker and AWS to deploy the application.', evidence_type: 'project' },
  })
  assert.equal(result.score_breakdown.categories.relevant_evidence_and_applied_ability.subcriteria.applied_evidence.level, 'strong')
  assert.equal(result.score_breakdown.categories.technical_and_role_specific_capability.subcriteria.tools_platforms.level, 'strong')
})

// Adversarial fixture 6: a fabricated/malformed evidence reference (an
// evidence_type or cv_section the schema does not recognize) — must be
// rejected the same as a missing reference, not silently coerced.
test('ADVERSARIAL 6: an evidence reference with an unrecognized cv_section is rejected', () => {
  assert.throws(
    () =>
      analyze({
        ...subcriteriaDefaults('none'),
        applied_skill_evidence_level: 'strong',
        applied_skill_evidence: GROUNDED_EVIDENCE,
        applied_skill_reference: { cv_section: 'hobbies' as never, entry_reference: 'x', evidence_basis: 'x', evidence_type: 'project' },
      }),
    /applied_skill.*"strong".*valid evidence object/i,
  )
})

// Adversarial fixture 7: a "partial"/"strong" rating with a null evidence
// reference — the correct shape for "none", not for a claimed classification.
test('ADVERSARIAL 7: a moderate rating with a null evidence reference is rejected', () => {
  assert.throws(
    () =>
      analyze({
        ...subcriteriaDefaults('none'),
        skill_application_evidence_level: 'partial',
        skill_application_evidence: GROUNDED_EVIDENCE,
        skill_application_reference: null,
      }),
    /skill_application.*"partial".*not null/i,
  )
})

// Adversarial fixture 8: "strong" supported only by a summary statement —
// same shape as adversarial 2, phrased as the report's own scenario.
test('ADVERSARIAL 8: a strong rating supported only by a summary statement is rejected', () => {
  assert.throws(
    () =>
      analyze({
        ...subcriteriaDefaults('none'),
        applied_skill_evidence_level: 'strong',
        applied_skill_evidence: GROUNDED_EVIDENCE,
        applied_skill_reference: { cv_section: 'summary', entry_reference: 'Summary', evidence_basis: 'Skilled in Python and SQL.', evidence_type: 'employment' },
      }),
    /applied_skill.*"strong".*listed only/i,
  )
})

// Adversarial fixture 9: the identical evidence_basis text reused verbatim
// as filler across four evidence dependent fields, with no independent
// explanation of relevance to any of them. (Three fields sharing text is
// tolerated — see the FAIRNESS tests below — since one real entry may
// legitimately answer several closely related questions almost identically;
// four or more sharing byte identical text is the filler signal.)
test('ADVERSARIAL 9: identical evidence reused across four fields without independent justification is rejected', () => {
  const sharedRef: EvidenceReference = { cv_section: 'projects', entry_reference: 'Project: X', evidence_basis: 'Built a data pipeline using Python.', evidence_type: 'project' }
  assert.throws(
    () =>
      analyze({
        ...subcriteriaDefaults('none'),
        applied_evidence_level: 'strong',
        applied_evidence: GROUNDED_EVIDENCE,
        applied_evidence_reference: sharedRef,
        applied_skill_evidence_level: 'strong',
        applied_skill_evidence: GROUNDED_EVIDENCE,
        applied_skill_reference: { ...sharedRef },
        results_evidence_level: 'strong',
        results_evidence: GROUNDED_EVIDENCE,
        results_reference: { ...sharedRef },
        skill_application_evidence_level: 'strong',
        skill_application_evidence: GROUNDED_EVIDENCE,
        skill_application_reference: { ...sharedRef },
      }),
    /evidence_basis is identical, unadapted filler/i,
  )
})

// Fairness regression: live testing against real candidates found that
// requiring pairs of evidence dependent fields to differ rejected genuinely
// well evidenced candidates outright, since one real job or project
// legitimately (and reasonably, per the prompt's own guidance) produces
// near identical short paraphrases for closely related questions about it.
// Two or three fields sharing identical evidence_basis text must not, by
// itself, fail the check — a candidate with exactly one strong project must
// be able to earn full marks across all five evidence dependent fields from
// it, the same as a candidate with five separate projects.
test('FAIRNESS: one strong project can support all five evidence dependent fields at once, each with its own criterion specific explanation', () => {
  const entry = { cv_section: 'projects' as const, entry_reference: 'Project: Sales Dashboard', evidence_type: 'project' as const }
  const result = analyze({
    applied_evidence_level: 'strong',
    applied_evidence: GROUNDED_EVIDENCE,
    applied_evidence_reference: { ...entry, evidence_basis: 'Designed and built a sales analytics dashboard end to end, owning the whole project.' },
    applied_skill_evidence_level: 'strong',
    applied_skill_evidence: GROUNDED_EVIDENCE,
    applied_skill_reference: { ...entry, evidence_basis: 'Used SQL and Python throughout to build the dashboard, not just listed as skills.' },
    results_evidence_level: 'strong',
    results_evidence: GROUNDED_EVIDENCE,
    results_reference: { ...entry, evidence_basis: 'Shipped a completed, working dashboard used by the team.' },
    skill_application_evidence_level: 'strong',
    skill_application_evidence: GROUNDED_EVIDENCE,
    skill_application_reference: { ...entry, evidence_basis: 'Applied this job\'s essential SQL and BI tooling skills to build the dashboard.' },
    tools_platforms_evidence_level: 'strong',
    tools_platforms_evidence: GROUNDED_EVIDENCE,
    tools_platforms_reference: { ...entry, evidence_basis: 'Used Power BI and SQL in this project, actual contextual use.' },
    certifications_evidence_level: 'none',
    certifications_evidence: '',
    role_fit_evidence_level: 'strong',
    role_fit_evidence: GROUNDED_EVIDENCE,
    technical_communication_level: 'strong',
    technical_communication_evidence: GROUNDED_EVIDENCE,
    cv_structure_level: 'strong',
  })
  for (const key of ['applied_evidence', 'applied_skill', 'results', 'skill_application', 'tools_platforms'] as const) {
    const category = key === 'applied_evidence' || key === 'applied_skill' || key === 'results'
      ? result.score_breakdown.categories.relevant_evidence_and_applied_ability
      : result.score_breakdown.categories.technical_and_role_specific_capability
    assert.equal(category.subcriteria[key].level, 'strong', `${key} should be strong from the one shared project`)
  }
})

test('findReusedEvidenceBasis: flags only four or more fields sharing identical (case/whitespace insensitive) evidence_basis text', () => {
  const threeFieldRefs: Record<string, EvidenceReference> = {
    applied_evidence: { cv_section: 'projects', entry_reference: 'A', evidence_basis: 'Built a Dashboard.  ', evidence_type: 'project' },
    applied_skill: { cv_section: 'projects', entry_reference: 'B', evidence_basis: '  built a dashboard.', evidence_type: 'project' },
    results: { cv_section: 'projects', entry_reference: 'C', evidence_basis: 'BUILT A DASHBOARD.', evidence_type: 'project' },
  }
  assert.equal(findReusedEvidenceBasis(threeFieldRefs).length, 0)

  const fourFieldRefs: Record<string, EvidenceReference> = {
    ...threeFieldRefs,
    skill_application: { cv_section: 'projects', entry_reference: 'D', evidence_basis: 'built a dashboard.', evidence_type: 'project' },
    tools_platforms: { cv_section: 'projects', entry_reference: 'E', evidence_basis: 'A distinct sentence.', evidence_type: 'project' },
  }
  const reused = findReusedEvidenceBasis(fourFieldRefs)
  assert.equal(reused.length, 1)
  assert.deepEqual(reused[0].sort(), ['applied_evidence', 'applied_skill', 'results', 'skill_application'])
})

test('findReusedEvidenceBasis skips null references entirely', () => {
  const refs: Record<string, EvidenceReference | null> = {
    applied_evidence: null,
    applied_skill: null,
    results: null,
    skill_application: null,
    tools_platforms: null,
  }
  assert.equal(findReusedEvidenceBasis(refs).length, 0)
})

test('resolveEvidenceDependentClassification allows evidence_type "none" only for the tools_platforms listed-partial exception', () => {
  const toolsResolved = resolveEvidenceDependentClassification('tools_platforms', 'partial', {
    cv_section: 'skills', entry_reference: 'Skills list', evidence_basis: 'Named as a skill.', evidence_type: 'none',
  })
  assert.equal(toolsResolved.level, 'partial')
  assert.ok(toolsResolved.reference !== null)
})

// Reliability fix: live testing found the model reproducibly pairing a
// "strong"/"partial" level with evidence_type "none" outside the
// tools_platforms exception on the thinnest CVs (education-and-skills-list
// only, empty work history), and not reliably fixing it on the one
// correction retry — driving up retry-exhaustion on exactly the CVs this
// should complete gracefully. This self-contradiction is now normalized
// down to "none" rather than rejected: the model's own evidence_type "none"
// is the more trustworthy signal, and normalizing only ever lowers a
// rating, never inflates one.
test('resolveEvidenceDependentClassification normalizes a non-none level with evidence_type "none" down to none, outside the one exception', () => {
  const resolved = resolveEvidenceDependentClassification('applied_skill', 'partial', {
    cv_section: 'skills', entry_reference: 'Skills list', evidence_basis: 'Named as a skill.', evidence_type: 'none',
  })
  assert.deepEqual(resolved, { level: 'none', reference: null })
})

// Fairness/robustness regression: live testing found the model correctly
// setting evidence_type "none" for the tools_platforms listed-partial
// exception, but then also leaving entry_reference/evidence_basis empty
// (conflating "evidence_type is none" with "the whole reference is empty
// because the level is none"). Rather than hard fail a genuinely low stakes
// classification on a schema-compliance technicality, this one exception
// is validated leniently on every field except cv_section.
test('the tools_platforms listed-partial exception tolerates an otherwise empty reference, unlike every other evidence dependent field', () => {
  const toolsResolved = resolveEvidenceDependentClassification('tools_platforms', 'partial', {
    cv_section: 'skills', entry_reference: '', evidence_basis: '', evidence_type: 'none',
  })
  assert.equal(toolsResolved.level, 'partial')

  // applied_skill with evidence_type "project" (not "none") but empty
  // entry_reference/evidence_basis is a different, clear-cut violation —
  // still rejected for correction, not normalized.
  assert.throws(() =>
    resolveEvidenceDependentClassification('applied_skill', 'partial', {
      cv_section: 'projects', entry_reference: '', evidence_basis: '', evidence_type: 'project',
    }),
  )
})

test('isValidEvidenceReference rejects an evidence_basis longer than the paraphrase limit', () => {
  const tooLong = 'x'.repeat(200)
  assert.equal(
    isValidEvidenceReference({ cv_section: 'projects', entry_reference: 'A', evidence_basis: tooLong, evidence_type: 'project' }),
    false,
  )
})

test('resolveEvidenceDependentClassification requires null (not a fabricated object) for a "none" level', () => {
  assert.deepEqual(resolveEvidenceDependentClassification('applied_evidence', 'none', null), { level: 'none', reference: null })
})

test('resolveEvidenceDependentClassification rejects a "none" level paired with a non-null reference object', () => {
  assert.throws(
    () =>
      resolveEvidenceDependentClassification('applied_evidence', 'none', {
        cv_section: 'projects', entry_reference: 'A', evidence_basis: 'Fabricated.', evidence_type: 'project',
      }),
    /applied_evidence.*"none".*must be null/i,
  )
})

test('resolveEvidenceDependentClassification rejects a "strong"/"partial" level paired with a null reference', () => {
  assert.throws(
    () => resolveEvidenceDependentClassification('applied_evidence', 'strong', null),
    /applied_evidence.*"strong".*not null/i,
  )
})

// Adversarial fixtures 10/11: composed with withRetry exactly the way
// index.ts's generateFeedback does — a rejected first classification is
// corrected on the retry (success), and a second invalid classification
// fails safely rather than ever completing the check.
await testAsync('ADVERSARIAL 10: an invalid first classification is corrected successfully on retry', async () => {
  let attempt = 0
  const result = await withRetry(async () => {
    attempt += 1
    const raw = baseRaw(
      attempt === 1
        ? {
            applied_skill_evidence_level: 'strong',
            applied_skill_evidence: GROUNDED_EVIDENCE,
            applied_skill_reference: listedOnlyReference(),
          }
        : {
            applied_skill_evidence_level: 'strong',
            applied_skill_evidence: GROUNDED_EVIDENCE,
            applied_skill_reference: demonstratingReference('applied_skill'),
          },
    )
    return normalizeAnalysis(raw, CV_TEXT)
  }, 2)
  assert.equal(attempt, 2)
  assert.equal(
    result.score_breakdown.categories.relevant_evidence_and_applied_ability.subcriteria.applied_skill.level,
    'strong',
  )
})

await testAsync('ADVERSARIAL 11: a second invalid classification fails safely, never completing the check', async () => {
  await assert.rejects(
    () =>
      withRetry(async () => {
        const raw = baseRaw({
          applied_skill_evidence_level: 'strong',
          applied_skill_evidence: GROUNDED_EVIDENCE,
          applied_skill_reference: listedOnlyReference(),
        })
        return normalizeAnalysis(raw, CV_TEXT)
      }, 2),
    (error: unknown) => error instanceof Error && (error.message.match(/listed only/g) ?? []).length === 2,
  )
})

// Fairness regression guard: the deterministic invariants above must not
// unfairly reduce a genuinely strong, no-employment candidate — full marks
// must still be reachable from project evidence alone.
test('FAIRNESS: a candidate with no employment but strong, well documented project evidence still reaches full marks', () => {
  const result = analyze({
    requirements: [
      requirement({ requirement: 'SQL', category: 'skills', importance: 'must_have', match_strength: 'strong' }),
    ],
    uvp_evidence_level: 'strong',
    ...subcriteriaDefaults('strong'),
  })
  assert.equal(result.experience_score, 100)
  assert.equal(result.interview_probability_score, 100)
})

// ---------------------------------------------------------------------------
// classifyValidationFailure: maps real thrown messages to non-sensitive
// monitoring reason codes, never re-exposing the raw message itself.
// ---------------------------------------------------------------------------

test('classifyValidationFailure maps a null-reference violation', () => {
  assert.equal(
    classifyValidationFailure('applied_evidence: classification is "none", so applied_evidence_reference must be null, not an object.'),
    'reference_must_be_null',
  )
})

test('classifyValidationFailure maps a missing/invalid reference violation', () => {
  assert.equal(
    classifyValidationFailure('applied_skill: classification is "strong", so applied_skill_reference must be a complete, valid evidence object (cv_section, entry_reference, evidence_basis, evidence_type).'),
    'missing_reference',
  )
})

test('classifyValidationFailure maps a listed-not-demonstrated violation', () => {
  assert.equal(
    classifyValidationFailure('results: classification is "strong", but cv_section is "summary" (listed only) — a listed skill may only support tools_platforms partial claimed familiarity, never "strong" here or anywhere else.'),
    'listed_not_demonstrated',
  )
})

test('classifyValidationFailure maps a reused-evidence violation', () => {
  assert.equal(
    classifyValidationFailure('applied_evidence, applied_skill, results, skill_application: evidence_basis is identical, unadapted filler across most of these fields.'),
    'reused_generic_evidence',
  )
})

test('classifyValidationFailure maps a score breakdown arithmetic violation', () => {
  assert.equal(
    classifyValidationFailure('score_breakdown: raw_weighted_score (80) does not equal the three category subtotals (expected 75)'),
    'invalid_score_total',
  )
})

test('classifyValidationFailure maps a model timeout', () => {
  assert.equal(classifyValidationFailure('OpenAI request timed out after 45000ms'), 'model_timeout')
})

test('classifyValidationFailure maps an OpenAI API error', () => {
  assert.equal(classifyValidationFailure('OpenAI API error: 500 Internal Server Error'), 'model_api_error')
})

test('classifyValidationFailure falls back to a generic code for an unrecognized message', () => {
  assert.equal(classifyValidationFailure('Something entirely unexpected happened'), 'other_validation_failure')
})

test('classifyValidationFailure never needs to inspect CV, job description, or raw AI content to classify', () => {
  // Every real throw site in logic.ts uses a static, template derived
  // message — this test documents that the classifier only ever pattern
  // matches on that fixed vocabulary, never on arbitrary candidate content.
  const reused = findReusedEvidenceBasis({
    a: { cv_section: 'projects', entry_reference: 'A', evidence_basis: 'Confidential candidate detail.', evidence_type: 'project' },
    b: { cv_section: 'projects', entry_reference: 'B', evidence_basis: 'Confidential candidate detail.', evidence_type: 'project' },
    c: { cv_section: 'projects', entry_reference: 'C', evidence_basis: 'Confidential candidate detail.', evidence_type: 'project' },
    d: { cv_section: 'projects', entry_reference: 'D', evidence_basis: 'Confidential candidate detail.', evidence_type: 'project' },
  })
  assert.equal(reused.length, 1)
  const message = `${reused.map((fields) => fields.join(', ')).join(' | ')}: evidence_basis is identical, unadapted filler across most of these fields.`
  assert.equal(classifyValidationFailure(message), 'reused_generic_evidence')
  assert.ok(!message.includes('Confidential candidate detail'))
})

// ---------------------------------------------------------------------------
// Written feedback preservation: the detailed scoring rubric must never
// replace, rename, or restructure the existing Strengths/Areas to
// Improve/Prospects feedback system. These fields, their JSON schema slots,
// and their selection logic are all byte-for-byte identical to what was
// already live in production before this rubric work began (confirmed via
// `git diff origin/main -- logic.ts` touching zero lines in
// combineFinding/ensureThreeNeedsImprovementItems/buildScoreAwareProspects
// or the strengths/generatedImprovements/prospects construction below) —
// these tests exist to keep it that way going forward.
// ---------------------------------------------------------------------------

test('WRITTEN FEEDBACK: a fully strong candidate receives exactly 2 strengths, not 11 subcriterion restatements', () => {
  const result = analyze({
    requirements: [
      requirement({ requirement: 'Req A', category: 'experience', importance: 'must_have', match_strength: 'strong' }),
      requirement({ requirement: 'Req B', category: 'skills', importance: 'must_have', match_strength: 'strong' }),
    ],
    uvp_evidence_level: 'strong',
    uvp_evidence: 'Grew the flagship product from zero to a documented multi million dollar revenue line.',
    ...subcriteriaDefaults('strong'),
  })
  assert.equal(result.strengths.length, 2)
  // The written feedback is the model's own prose (Tell -> Show sentences),
  // never a restatement of a scoring subcriterion name like "applied_evidence".
  for (const strength of result.strengths) {
    assert.ok(!/applied_evidence|applied_skill|skill_application|tools_platforms|cv_structure/i.test(strength))
  }
})

test('WRITTEN FEEDBACK: the Needs Improvement band always produces exactly 3 areas to improve', () => {
  const result = analyze({
    requirements: [
      requirement({ requirement: 'Requirement 18', category: 'experience', importance: 'must_have', match_strength: 'partial' }),
      requirement({ requirement: 'Requirement 19', category: 'experience', importance: 'important', match_strength: 'strong' }),
      requirement({ requirement: 'Requirement 20', category: 'skills', importance: 'must_have', match_strength: 'partial' }),
      requirement({ requirement: 'Requirement 21', category: 'skills', importance: 'nice_to_have', match_strength: 'none' }),
    ],
    uvp_evidence_level: 'partial',
    ...subcriteriaDefaults('strong'),
    skill_application_evidence_level: 'partial',
    tools_platforms_evidence_level: 'partial',
    certifications_evidence_level: 'partial',
  })
  assert.equal(getScoreLabel(result.interview_probability_score), 'Needs Improvement')
  assert.equal(result.improvements.length, 3)
})

test('WRITTEN FEEDBACK: prospects are always exactly 2 sentences, regardless of score band', () => {
  const strong = analyze({ ...subcriteriaDefaults('strong'), uvp_evidence_level: 'strong' })
  const weak = analyze({ ...subcriteriaDefaults('none'), uvp_evidence_level: 'none' })
  assert.equal(strong.prospects.length, 2)
  assert.equal(weak.prospects.length, 2)
})

test('WRITTEN FEEDBACK: the raw AI schema still has exactly 2 strength slots, 3 improvement slots, and 2 prospect slots', () => {
  const raw = baseRaw()
  const strengthSlots = ['strength_1_finding', 'strength_2_finding'].filter((key) => key in raw)
  const improvementSlots = ['improvement_1_finding', 'improvement_2_finding', 'improvement_3_finding'].filter((key) => key in raw)
  const prospectSlots = ['prospect_1', 'prospect_2'].filter((key) => key in raw)
  assert.equal(strengthSlots.length, 2)
  assert.equal(improvementSlots.length, 3)
  assert.equal(prospectSlots.length, 2)
  // No fourth strength, no fifth improvement, no third prospect slot exists.
  assert.ok(!('strength_3_finding' in raw))
  assert.ok(!('improvement_4_finding' in raw))
  assert.ok(!('prospect_3' in raw))
})

test('WRITTEN FEEDBACK: strengths/improvements/prospects are plain prose strings, never a serialized scoring object', () => {
  const result = analyze({ ...subcriteriaDefaults('partial'), uvp_evidence_level: 'partial' })
  for (const item of [...result.strengths, ...result.improvements, ...result.prospects]) {
    assert.equal(typeof item, 'string')
    assert.ok(!item.trim().startsWith('{'))
    assert.ok(!item.includes('score_breakdown'))
    assert.ok(!item.includes('evidence_reference'))
  }
})

console.log(`\n${passed} tests passed`)
