// Run with: npx tsx src/lib/evidenceAssessment.test.ts
import assert from 'node:assert/strict'
import type { RequirementEvidenceRow } from '@/types'
import { distinctRecruiterDoubts, isCandidateReportedEvidence } from './evidenceAssessment'

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

const ANSWER =
  'At Thistledown Systems I defined 4 adoption KPIs for our search feature and used the weekly dashboard to decide which 2 experiments to ship.'

const ORIGINAL_ROWS = [
  row({ requirement: 'SQL for adoption reporting', evidence_strength: 'strong', evidence_found: 'Skills: SQL, Figma, Jira.' }),
  row({ evidence_strength: 'none', evidence_found: 'No matching evidence found in the CV.' }),
]

test('with no credited answer, nothing is candidate reported', () => {
  const quoted = row({ evidence_found: 'defined 4 adoption KPIs for our search feature' })
  assert.equal(isCandidateReportedEvidence(quoted, { originalRows: ORIGINAL_ROWS, candidateAnswer: null }), false)
})

test('a row with no evidence is never candidate reported', () => {
  const none = row({ evidence_strength: 'none', evidence_found: 'No matching evidence found in the CV.' })
  assert.equal(isCandidateReportedEvidence(none, { originalRows: ORIGINAL_ROWS, candidateAnswer: ANSWER }), false)
})

test('an excerpt quoted from the answer is candidate reported', () => {
  const quoted = row({ evidence_strength: 'strong', evidence_found: 'defined 4 adoption KPIs for our search feature' })
  assert.equal(isCandidateReportedEvidence(quoted, { originalRows: ORIGINAL_ROWS, candidateAnswer: ANSWER }), true)
})

test('casing and a trailing period do not hide a quote from the answer', () => {
  const quoted = row({ evidence_strength: 'strong', evidence_found: 'Defined 4 adoption KPIs for our search feature.' })
  assert.equal(isCandidateReportedEvidence(quoted, { originalRows: ORIGINAL_ROWS, candidateAnswer: ANSWER }), true)
})

test('a close paraphrase of the answer is still candidate reported', () => {
  const paraphrase = row({
    evidence_strength: 'strong',
    evidence_found: 'Defined adoption KPIs for the search feature and used the weekly dashboard to choose experiments.',
  })
  assert.equal(isCandidateReportedEvidence(paraphrase, { originalRows: ORIGINAL_ROWS, candidateAnswer: ANSWER }), true)
})

test('an excerpt the CV only assessment already quoted stays CV evidence, even when the answer repeats it', () => {
  const answerRepeatingCv = `${ANSWER} Skills: SQL, Figma, Jira.`
  const cvQuote = row({ requirement: 'SQL for adoption reporting', evidence_strength: 'strong', evidence_found: 'Skills: SQL, Figma, Jira.' })
  assert.equal(isCandidateReportedEvidence(cvQuote, { originalRows: ORIGINAL_ROWS, candidateAnswer: answerRepeatingCv }), false)
})

test('a shorter trim of an excerpt the CV only assessment quoted stays CV evidence', () => {
  const trimmed = row({ requirement: 'SQL for adoption reporting', evidence_strength: 'strong', evidence_found: 'SQL, Figma' })
  assert.equal(isCandidateReportedEvidence(trimmed, { originalRows: ORIGINAL_ROWS, candidateAnswer: `${ANSWER} I use SQL, Figma daily.` }), false)
})

test('a new CV excerpt unrelated to the answer stays CV evidence', () => {
  const cvOnly = row({
    requirement: 'Gathering requirements from technical teams',
    evidence_strength: 'moderate',
    evidence_found: 'Wrote specs and joined planning meetings.',
  })
  assert.equal(isCandidateReportedEvidence(cvOnly, { originalRows: ORIGINAL_ROWS, candidateAnswer: ANSWER }), false)
})

test('a doubt repeating a recruiter read or gap word for word is dropped', () => {
  const rows = [
    row({ recruiter_interpretation: 'SQL is claimed but practical use is unclear.', gap_note: 'Show a project or work example using SQL.' }),
  ]
  const doubts = [
    'sql is claimed, but practical use is unclear',
    'Show a project or work example using SQL.',
    'Metric ownership may look thin for a product role.',
  ]
  assert.deepEqual(distinctRecruiterDoubts(doubts, rows), ['Metric ownership may look thin for a product role.'])
})

test('a doubt repeated in the list itself appears once, and order is kept', () => {
  const doubts = ['Adoption tracking is not shown.', 'Figma use is listed only.', 'Adoption tracking is not shown.']
  assert.deepEqual(distinctRecruiterDoubts(doubts, [row({})]), ['Adoption tracking is not shown.', 'Figma use is listed only.'])
})

test('a row with no gap note does not suppress anything', () => {
  const rows = [row({ evidence_strength: 'strong', gap_note: null })]
  assert.deepEqual(distinctRecruiterDoubts(['Adoption tracking is not shown.'], rows), ['Adoption tracking is not shown.'])
})

console.log(`\n${passed} tests passed`)
