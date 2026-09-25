// Run with: npx tsx src/lib/gapAnalysis.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { RequirementEvidenceRow } from '@/types'
import {
  buildGapAnalysisRows,
  GAP_ANALYSIS_CANDIDATE_REPORTED_NOTE,
  GAP_ANALYSIS_LABELS,
  GAP_ANALYSIS_SUBTITLE,
  GAP_ANALYSIS_TITLE,
  isCandidateReportedEvidence,
} from './gapAnalysis'
import { CANDIDATE_REPORTED_LABEL } from './evidenceFollowUp'

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

function row(overrides: Partial<RequirementEvidenceRow>): RequirementEvidenceRow {
  return {
    requirement: 'Experience defining product metrics',
    importance: 'must_have',
    evidence_strength: 'moderate',
    evidence_found: 'Wrote specs and joined planning meetings.',
    recruiter_interpretation: 'Planning involvement is shown but not metric ownership.',
    gap_note: 'Show a metric you defined and a decision it informed.',
    ...overrides,
  }
}

const NO_EVIDENCE = 'No matching evidence found in the CV.'
const ANSWER =
  'At Thistledown Systems I defined 4 adoption KPIs for our search feature and used the weekly dashboard to decide which 2 experiments to ship.'

const ORIGINAL_ROWS = [
  row({ requirement: 'SQL for adoption reporting', evidence_strength: 'strong', evidence_found: 'Skills: SQL, Figma, Jira.', gap_note: null }),
  row({ evidence_strength: 'none', evidence_found: NO_EVIDENCE }),
]

// ---------------------------------------------------------------------------
// Provenance: candidate reported evidence is never shown as CV evidence
// ---------------------------------------------------------------------------

test('with no credited answer, nothing is candidate reported', () => {
  const quoted = row({ evidence_found: 'defined 4 adoption KPIs for our search feature' })
  assert.equal(isCandidateReportedEvidence(quoted, { originalRows: ORIGINAL_ROWS, candidateAnswer: null }), false)
})

test('a row with no evidence is never candidate reported', () => {
  const none = row({ evidence_strength: 'none', evidence_found: NO_EVIDENCE })
  assert.equal(isCandidateReportedEvidence(none, { originalRows: ORIGINAL_ROWS, candidateAnswer: ANSWER }), false)
})

test('an excerpt quoted from the answer is candidate reported, whatever its casing or trailing period', () => {
  for (const quote of ['defined 4 adoption KPIs for our search feature', 'Defined 4 adoption KPIs for our search feature.']) {
    const quoted = row({ evidence_strength: 'strong', evidence_found: quote })
    assert.equal(isCandidateReportedEvidence(quoted, { originalRows: ORIGINAL_ROWS, candidateAnswer: ANSWER }), true)
  }
})

test('a close paraphrase of the answer is still candidate reported', () => {
  const paraphrase = row({
    evidence_strength: 'strong',
    evidence_found: 'Defined adoption KPIs for the search feature and used the weekly dashboard to choose experiments.',
  })
  assert.equal(isCandidateReportedEvidence(paraphrase, { originalRows: ORIGINAL_ROWS, candidateAnswer: ANSWER }), true)
})

test('an excerpt the CV only assessment already quoted stays CV evidence, even when the answer repeats it', () => {
  const cvQuote = row({ requirement: 'SQL for adoption reporting', evidence_strength: 'strong', evidence_found: 'Skills: SQL, Figma, Jira.' })
  const answer = `${ANSWER} Skills: SQL, Figma, Jira.`
  assert.equal(isCandidateReportedEvidence(cvQuote, { originalRows: ORIGINAL_ROWS, candidateAnswer: answer }), false)
  const trimmed = row({ requirement: 'SQL for adoption reporting', evidence_strength: 'strong', evidence_found: 'SQL, Figma' })
  assert.equal(isCandidateReportedEvidence(trimmed, { originalRows: ORIGINAL_ROWS, candidateAnswer: answer }), false)
})

test('a new CV excerpt unrelated to the answer stays CV evidence', () => {
  const cvOnly = row({ requirement: 'Gathering requirements', evidence_found: 'Wrote specs and joined planning meetings.' })
  assert.equal(isCandidateReportedEvidence(cvOnly, { originalRows: ORIGINAL_ROWS, candidateAnswer: ANSWER }), false)
})

// ---------------------------------------------------------------------------
// Gap Analysis rows
// ---------------------------------------------------------------------------

const MATRIX = [
  row({ requirement: 'Gathering requirements from engineering teams', evidence_strength: 'strong', evidence_found: 'Worked with engineering teams to define requirements.', gap_note: null }),
  row({ requirement: 'SQL for adoption reporting', evidence_strength: 'moderate', evidence_found: 'Skills: SQL, Figma, Jira.', recruiter_interpretation: 'SQL is claimed but practical use is unclear.', gap_note: 'Show a project or work example using SQL.' }),
  row({ requirement: 'Experience defining product metrics', evidence_strength: 'none', evidence_found: NO_EVIDENCE, recruiter_interpretation: 'No evidence of defining product metrics is present.', gap_note: 'Include examples of metrics used in product decisions.' }),
]
const NO_FOLLOW_UP = { originalRows: MATRIX, candidateAnswer: null, selectedRequirement: null }

test('strong requirements are left to Strengths, not shown as gaps', () => {
  const rows = buildGapAnalysisRows(MATRIX, NO_FOLLOW_UP)
  assert.ok(!rows.some((gap) => gap.requirement.startsWith('Gathering requirements')))
})

test('incomplete and missing requirements are shown with exactly the matrix evidence', () => {
  const rows = buildGapAnalysisRows(MATRIX, NO_FOLLOW_UP)
  assert.deepEqual(rows, [
    {
      requirement: 'SQL for adoption reporting',
      cvShows: 'Skills: SQL, Figma, Jira.',
      candidateReported: null,
      recruiterRead: 'SQL is claimed but practical use is unclear.',
      gap: 'Show a project or work example using SQL.',
    },
    {
      requirement: 'Experience defining product metrics',
      cvShows: NO_EVIDENCE,
      candidateReported: null,
      recruiterRead: 'No evidence of defining product metrics is present.',
      gap: 'Include examples of metrics used in product decisions.',
    },
  ])
})

test('the gap the follow up asks about is listed first', () => {
  const rows = buildGapAnalysisRows(MATRIX, { ...NO_FOLLOW_UP, selectedRequirement: 'Experience defining product metrics' })
  assert.deepEqual(
    rows.map((gap) => gap.requirement),
    ['Experience defining product metrics', 'SQL for adoption reporting'],
  )
})

test('the selected gap still matches after the follow up cleaned its dashes', () => {
  const matrix = [...MATRIX, row({ requirement: 'Data-driven decision-making', evidence_strength: 'none', evidence_found: NO_EVIDENCE })]
  const rows = buildGapAnalysisRows(matrix, { ...NO_FOLLOW_UP, originalRows: matrix, selectedRequirement: 'Data driven decision making' })
  assert.equal(rows[0].requirement, 'Data-driven decision-making')
})

test('a short name is not mistaken for a longer requirement that starts with it', () => {
  const rows = buildGapAnalysisRows(MATRIX, { ...NO_FOLLOW_UP, selectedRequirement: 'SQL' })
  assert.deepEqual(
    rows.map((gap) => gap.requirement),
    ['SQL for adoption reporting', 'Experience defining product metrics'],
  )
})

test('after a credited follow up, the answer is shown as candidate reported beside what the CV itself shows', () => {
  const reassessed = [
    MATRIX[0],
    MATRIX[1],
    row({
      requirement: 'Experience defining product metrics',
      evidence_strength: 'strong',
      evidence_found: 'defined 4 adoption KPIs for our search feature',
      recruiter_interpretation: 'Specific metric ownership tied to product decisions.',
      gap_note: null,
    }),
  ]
  const rows = buildGapAnalysisRows(reassessed, {
    originalRows: MATRIX,
    candidateAnswer: ANSWER,
    selectedRequirement: 'Experience defining product metrics',
  })
  assert.deepEqual(rows[0], {
    requirement: 'Experience defining product metrics',
    cvShows: NO_EVIDENCE,
    candidateReported: 'defined 4 adoption KPIs for our search feature',
    recruiterRead: 'Specific metric ownership tied to product decisions.',
    gap: null,
  })
  // Never the answer under "What your CV shows".
  for (const gap of rows) assert.ok(!gap.cvShows || !ANSWER.includes(gap.cvShows))
})

test('when the CV only assessment has no such requirement, nothing is claimed about the CV', () => {
  const reassessed = [row({ requirement: 'Product analytics', evidence_strength: 'strong', evidence_found: 'defined 4 adoption KPIs for our search feature', gap_note: null })]
  const rows = buildGapAnalysisRows(reassessed, { originalRows: MATRIX, candidateAnswer: ANSWER, selectedRequirement: null })
  assert.equal(rows[0].cvShows, null)
  assert.equal(rows[0].candidateReported, 'defined 4 adoption KPIs for our search feature')
})

test('Gap Analysis stays concise: one flat entry per gap, no strength sections, no added text', () => {
  const rows = buildGapAnalysisRows(MATRIX, NO_FOLLOW_UP)
  assert.ok(rows.length <= MATRIX.filter((gap) => gap.evidence_strength !== 'strong').length)
  for (const gap of rows) {
    assert.deepEqual(Object.keys(gap).sort(), ['candidateReported', 'cvShows', 'gap', 'recruiterRead', 'requirement'])
  }
})

// ---------------------------------------------------------------------------
// Copy and the retired "How a recruiter reads your CV" presentation
// ---------------------------------------------------------------------------

test('the section is Gap Analysis with the four labels, no strength sections and no dashes', () => {
  assert.equal(GAP_ANALYSIS_TITLE, 'Gap Analysis')
  assert.equal(GAP_ANALYSIS_SUBTITLE, 'We checked the important requirements in the job description against the evidence in your CV.')
  assert.deepEqual(Object.values(GAP_ANALYSIS_LABELS), ['Requirement', 'What your CV shows', 'Recruiter read', 'Gap'])
  const copy = [GAP_ANALYSIS_TITLE, GAP_ANALYSIS_SUBTITLE, GAP_ANALYSIS_CANDIDATE_REPORTED_NOTE, ...Object.values(GAP_ANALYSIS_LABELS)]
  for (const text of copy) {
    assert.doesNotMatch(text, /Strong evidence|Moderate evidence|No evidence|How a recruiter reads your CV/)
    assert.doesNotMatch(text, /[-–—]/)
  }
  assert.equal(CANDIDATE_REPORTED_LABEL, 'Candidate reported, not on your CV')
})

test('the report renders Gap Analysis, not the old strength grouped section', () => {
  const page = readFileSync('src/pages/FeedbackPage.tsx', 'utf8')
  const card = readFileSync('src/components/feedback/GapAnalysisCard.tsx', 'utf8')
  assert.match(page, /<GapAnalysisCard /)
  assert.doesNotMatch(page, /EvidenceAssessmentCard|How a recruiter reads your CV/)
  assert.doesNotMatch(card, /How a recruiter reads your CV|Strong evidence|Moderate evidence|What may make a recruiter hesitate|evidence_strength/)
})

console.log(`\n${passed} tests passed`)
