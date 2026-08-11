// Run with: npx tsx supabase/functions/analyze-check/logic.test.ts
import assert from 'node:assert/strict'
import { combineFinding, looksLikeEnglish, normalizeAnalysis, stripDashes, type RawAnalysis } from './logic.ts'

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

function baseRaw(overrides: Partial<RawAnalysis> = {}): RawAnalysis {
  return {
    job_title: 'Senior Backend Engineer',
    company_name: 'Acme',
    experience_score: 70,
    skills_score: 65,
    uvp_score: 60,
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

// TELL -> SHOW: heading, evidence sentence, and an "Example:" clause with a
// generic placeholder, all present in the combined string the Feedback page
// splits back apart.
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

// Safeguard: the model self-reports any fact it introduced beyond the CV
// (new_claims_introduced) — normalizeAnalysis must reject that output rather
// than silently letting a fabricated fact through.
test('normalizeAnalysis rejects output that self-reports an unverified claim', () => {
  assert.throws(
    () => normalizeAnalysis(baseRaw({ new_claims_introduced: ['Increased revenue by 25%'] })),
    /unverified claims/,
  )
})

test('normalizeAnalysis accepts clean output and computes the weighted score', () => {
  const result = normalizeAnalysis(baseRaw({ experience_score: 80, skills_score: 60, uvp_score: 40 }))
  // 0.4*80 + 0.35*60 + 0.25*40 = 32 + 21 + 10 = 63
  assert.equal(result.interview_probability_score, 63)
  assert.equal(result.strengths.length, 2)
  assert.equal(result.improvements.length, 3)
  assert.equal(result.prospects.length, 2)
})

test('normalizeAnalysis rejects non English content', () => {
  // The English check runs against the combined text of all strengths,
  // improvements, and prospects, so every field needs to be non English for
  // the heuristic (which needs 5+ English "tells" across the whole blob) to
  // reliably fail.
  assert.throws(
    () =>
      normalizeAnalysis(
        baseRaw({
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
      ),
    /did not look like English/,
  )
})

test('looksLikeEnglish is a reasonable heuristic', () => {
  assert.ok(looksLikeEnglish('This is a sentence that you and your team are working with for the project.'))
  assert.ok(!looksLikeEnglish('Dit is een zin die u en uw team gebruiken voor het project.'))
})

test('stripDashes converts compounds and clause dashes to plain words', () => {
  assert.equal(stripDashes('data-driven, well-known'), 'data driven, well known')
})

console.log(`\n${passed} tests passed`)
