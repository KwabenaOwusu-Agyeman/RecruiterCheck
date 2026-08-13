// Run with: npx tsx supabase/functions/analyze-check/logic.test.ts
import assert from 'node:assert/strict'
import {
  applyCriticalGapCap,
  calculateCategoryScore,
  calculateUvpScore,
  capRequirements,
  combineFinding,
  extractQuantifiedClaims,
  hasUnsupportedNamedEntity,
  isGroundedInCv,
  looksLikeEnglish,
  normalizeAnalysis,
  stripDashes,
  type RawAnalysis,
  type RawRequirement,
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

// TEST 1 — strong candidate
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
  })
  assert.equal(result.experience_score, 100)
  assert.equal(result.skills_score, 100)
  assert.equal(result.uvp_score, 100)
  assert.equal(result.interview_probability_score, 100)
  assert.equal(getScoreLabel(result.interview_probability_score), 'Likely Interview Candidate')
  assert.deepEqual(result.improvements, [])
  assert.match(result.prospects[0], /complete documented alignment/i)
})

// TEST 2 — partial candidate
test('normalizeAnalysis: a mix of strong/partial/none lands in Needs Improvement', () => {
  const result = analyze({
    requirements: [
      requirement({ requirement: 'Requirement 18', category: 'experience', importance: 'must_have', match_strength: 'partial' }),
      requirement({ requirement: 'Requirement 19', category: 'experience', importance: 'important', match_strength: 'strong' }),
      requirement({ requirement: 'Requirement 20', category: 'skills', importance: 'must_have', match_strength: 'partial' }),
      requirement({ requirement: 'Requirement 21', category: 'skills', importance: 'nice_to_have', match_strength: 'none' }),
    ],
    uvp_evidence_level: 'partial',
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
    improvement_1_finding: 'Include BSN and work permit status',
    improvement_1_evidence: 'Your CV does not mention your BSN or work permit status.',
    improvement_1_example: 'Clearly state your BSN and work permit status in your application.',
  })
  assert.equal(result.skills_score, 100)
  assert.match(result.improvements[0], /Authorized to work in the Netherlands/i)
  assert.doesNotMatch(result.improvements[0], /include your BSN/i)
  assert.match(result.improvements[0], /Never include your BSN or permit number/i)
})

test('normalizeAnalysis excludes other private and post hire identifiers from scoring', () => {
  const result = analyze({
    requirements: [
      requirement({ requirement: 'Passport number required', category: 'skills', importance: 'must_have', critical: true, match_strength: 'none', cv_evidence: '' }),
      requirement({ requirement: 'Customer service', category: 'skills', importance: 'important', match_strength: 'strong' }),
    ],
  })
  assert.equal(result.skills_score, 100)
})

test('normalizeAnalysis treats non mandatory availability as an application clarification, not a critical gap', () => {
  const result = analyze({
    requirements: [
      requirement({ requirement: 'Weekend shift availability', category: 'skills', importance: 'important', critical: true, match_strength: 'none', cv_evidence: '' }),
      requirement({ requirement: 'Customer service', category: 'skills', importance: 'must_have', match_strength: 'strong' }),
    ],
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
  })
  assert.ok(result.interview_probability_score <= 49)
  assert.equal(getScoreLabel(result.interview_probability_score), 'Not a Fit')
})

// Precise version of TEST 4: raw weighted score lands at exactly 78 (a
// verdict that would otherwise be "Needs Improvement") before the critical
// cap forces it down to 49 ("Not a Fit"). Experience=100 (single important
// match, strong), Skills=38 (matched=3/max=8: one must_have strong=3, one
// must_have none=0, one important none=0), UVP=100 (strong):
// 0.4*100 + 0.35*38 + 0.25*100 = 40 + 13.3 + 25 = 78.3 -> round = 78.
test('normalizeAnalysis: a raw weighted score of 78 is capped to 49 when a critical must_have is missing', () => {
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
  })
  assert.equal(result.experience_score, 100)
  assert.equal(result.skills_score, 38)
  assert.equal(result.uvp_score, 100)
  // The raw weighted score (before the cap) would round to 78 — confirm the
  // cap is actually doing something here, not just coincidentally landing low.
  const rawWeighted = Math.round(result.experience_score * 0.4 + result.skills_score * 0.35 + result.uvp_score * 0.25)
  assert.equal(rawWeighted, 78)
  assert.equal(result.interview_probability_score, 49)
  assert.equal(getScoreLabel(result.interview_probability_score), 'Not a Fit')
})

// TEST 5 — normal must-have missing, not critical
test('normalizeAnalysis: a non critical missing must_have lowers its category score but never triggers the cap', () => {
  const result = analyze({
    requirements: [
      requirement({
        requirement: 'Requirement 30',
        category: 'experience',
        importance: 'must_have',
        critical: false,
        match_strength: 'none',
        cv_evidence: '',
      }),
      requirement({ requirement: 'Requirement 31', category: 'experience', importance: 'important', match_strength: 'strong' }),
      requirement({ requirement: 'Requirement 32', category: 'skills', importance: 'must_have', match_strength: 'strong' }),
    ],
    uvp_evidence_level: 'strong',
  })
  assert.ok(result.experience_score < 100)
  // Nothing here forces a sub 50 outcome purely from a non critical gap.
  assert.notEqual(getScoreLabel(result.interview_probability_score), 'Not a Fit')
})

// TEST 6 — presentation weakness never removes fit credit
test('normalizeAnalysis: an unquantified but clearly evidenced requirement keeps full match credit', () => {
  const result = analyze({
    requirements: [
      requirement({
        requirement: 'Requirement 33',
        category: 'experience',
        importance: 'must_have',
        match_strength: 'strong',
        cv_evidence: 'Managed supplier and client relationships across Ghana, Liberia, Nigeria and Sierra Leone.',
      }),
    ],
    uvp_evidence_level: 'none',
    uvp_evidence: '',
  })
  assert.equal(result.experience_score, 100)
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
  const result = analyze({ requirements: [...niceToHaves, mustHave] })
  // 23 total requirements capped to 20: the must_have (weight 3, matched)
  // survives the cap, plus 19 of the 22 nice_to_have (weight 1, unmatched).
  // matched = 3, max = 3 + 19*1 = 22 -> round(3/22*100) = 14. Without the
  // cap all 22 nice_to_haves would count (max = 25 -> 12), so this also
  // confirms the cap is actually excluding entries, not a no-op.
  assert.equal(result.skills_score, 14)
})

// TEST 10 — UVP differentiation is never inflated by strong Experience/Skills
test('normalizeAnalysis: strong experience and skills do not by themselves produce a high UVP score', () => {
  const result = analyze({
    requirements: [
      requirement({ requirement: 'Requirement 36', category: 'experience', importance: 'must_have', match_strength: 'strong' }),
      requirement({ requirement: 'Requirement 37', category: 'skills', importance: 'must_have', match_strength: 'strong' }),
    ],
    uvp_evidence_level: 'none',
    uvp_evidence: '',
  })
  assert.equal(result.experience_score, 100)
  assert.equal(result.skills_score, 100)
  assert.equal(result.uvp_score, 0)
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
  assert.deepEqual(first, second)
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

console.log(`\n${passed} tests passed`)
