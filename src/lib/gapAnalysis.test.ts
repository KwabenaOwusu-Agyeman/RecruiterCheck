// Run with: npx tsx src/lib/gapAnalysis.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { RequirementEvidenceRow } from '@/types'
import { buildGapAnalysisItem, GAP_ANALYSIS_SUBTITLE, GAP_ANALYSIS_TITLE } from './gapAnalysis'

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
    evidence_strength: 'none',
    evidence_found: 'No matching evidence found in the CV.',
    recruiter_interpretation: 'No evidence of defining product metrics is present.',
    gap_note: 'Include examples of metrics used in product decisions.',
    ...overrides,
  }
}

const CV_ONLY_ROWS = [
  row({ requirement: 'Gathering requirements from engineering teams', evidence_strength: 'strong', evidence_found: 'Worked with engineering teams.', gap_note: null }),
  row({ requirement: 'SQL for adoption reporting', evidence_strength: 'moderate', evidence_found: 'Skills: SQL, Figma, Jira.', recruiter_interpretation: 'SQL is claimed but practical use is unclear.', gap_note: 'Show a project or work example using SQL.' }),
  row({}),
]

test('exactly one gap: the one the follow up asks about, with what is missing', () => {
  assert.deepEqual(buildGapAnalysisItem(CV_ONLY_ROWS, 'Experience defining product metrics'), {
    requirement: 'Experience defining product metrics',
    detail: 'Include examples of metrics used in product decisions.',
  })
})

test('no artificial gap when the analysis selected none', () => {
  for (const selected of [null, undefined, '', '   ']) {
    assert.equal(buildGapAnalysisItem(CV_ONLY_ROWS, selected), null)
  }
})

test('the recruiter read stands in when a row has no gap note, and nothing is invented when there is no row', () => {
  const noGapNote = [row({ gap_note: null })]
  assert.equal(buildGapAnalysisItem(noGapNote, 'Experience defining product metrics')?.detail, 'No evidence of defining product metrics is present.')
  assert.deepEqual(buildGapAnalysisItem([], 'Python for data cleaning'), { requirement: 'Python for data cleaning', detail: null })
})

test('the selected gap still matches after the follow up cleaned its dashes or cut a long name', () => {
  const dashed = [row({ requirement: 'Data-driven decision-making', gap_note: 'Show a decision you made from data.' })]
  assert.equal(buildGapAnalysisItem(dashed, 'Data driven decision making')?.detail, 'Show a decision you made from data.')
  const long = 'Experience owning product analytics across onboarding, activation, retention and monetisation funnels for a consumer mobile app'
  const cut = long.slice(0, 120).trimEnd()
  assert.equal(buildGapAnalysisItem([row({ requirement: long, gap_note: 'Show one funnel you owned.' })], cut)?.detail, 'Show one funnel you owned.')
})

test('a short name is not mistaken for a longer requirement that starts with it', () => {
  assert.deepEqual(buildGapAnalysisItem(CV_ONLY_ROWS, 'SQL'), { requirement: 'SQL', detail: null })
})

test('the gap is shown as the CV shows it: a reassessment never changes it', () => {
  // The page passes the CV only rows (feedback.requirement_evidence), never the reassessed ones.
  const page = readFileSync('src/pages/FeedbackPage.tsx', 'utf8')
  assert.match(page, /buildGapAnalysisItem\(feedback\?\.requirement_evidence \?\? \[\], followUp\.gap_requirement\)/)
  assert.doesNotMatch(page, /report\?\.requirementEvidence/)
})

test('the section is a title, one short explanation and the one gap', () => {
  assert.equal(GAP_ANALYSIS_TITLE, 'Gap Analysis')
  assert.match(GAP_ANALYSIS_SUBTITLE, /the gap that matters most/)
  assert.doesNotMatch(GAP_ANALYSIS_SUBTITLE, /[-–—]/)
  const card = readFileSync('src/components/feedback/GapAnalysisCard.tsx', 'utf8')
  assert.doesNotMatch(card, /\.map\(|How a recruiter reads your CV|Strong evidence|Moderate evidence|What may make a recruiter hesitate/)
})

test('Gap Analysis sits directly above the follow up, and both appear only together', () => {
  const page = readFileSync('src/pages/FeedbackPage.tsx', 'utf8')
  const gap = page.indexOf('<GapAnalysisCard gap={gapAnalysisItem}')
  const followUp = page.indexOf('<EvidenceFollowUpCard')
  assert.ok(gap > 0 && followUp > gap, 'Gap Analysis renders before the follow up')
  assert.match(page.slice(gap, followUp), /^<GapAnalysisCard gap=\{gapAnalysisItem\} dark=\{isDark\} \/>\s*\{showFollowUp \? \(\s*$/)
  assert.match(page, /const gapAnalysisItem = showFollowUp \?/)
})

console.log(`\n${passed} tests passed`)
