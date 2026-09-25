// Gap Analysis: which requirements the report shows as gaps, and where each
// piece of evidence came from. Pure and DOM free so it can be unit tested
// with the tsx runner. Built from the same requirement matrix the score uses.

import type { RequirementEvidenceRow } from '@/types'

export const GAP_ANALYSIS_TITLE = 'Gap Analysis'
export const GAP_ANALYSIS_SUBTITLE =
  'We checked the important requirements in the job description against the evidence in your CV.'
export const GAP_ANALYSIS_CANDIDATE_REPORTED_NOTE =
  'Evidence from your follow up answer is marked separately and weighed with more caution than evidence in your CV.'
export const GAP_ANALYSIS_LABELS = {
  requirement: 'Requirement',
  cvShows: 'What your CV shows',
  recruiterRead: 'Recruiter read',
  gap: 'Gap',
} as const

export interface GapAnalysisRow {
  requirement: string
  // What the CV itself shows. Null only for evidence from the answer whose
  // requirement the CV only assessment did not list.
  cvShows: string | null
  // A quote from the candidate's follow up answer, when the reassessment used it.
  candidateReported: string | null
  recruiterRead: string
  gap: string | null
}

// Same stopwords and word rule as significantWords in
// supabase/functions/analyze-check/logic.ts, the reassessment's grounding check.
const STOPWORD_TOKENS = new Set([
  'that', 'this', 'with', 'from', 'have', 'been', 'were', 'their', 'they',
  'your', 'you', 'which', 'into', 'over', 'than', 'then', 'also', 'across',
  'role', 'years', 'year', 'about', 'when', 'where', 'while', 'during',
  'each', 'these', 'those', 'such', 'more', 'most', 'some', 'only', 'just',
])

const ANSWER_OVERLAP_THRESHOLD = 0.5

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !STOPWORD_TOKENS.has(word))
}

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%€$£\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * After a credited follow up, rows come from a reassessment of the CV plus the
 * candidate's answer, so a quoted excerpt can be the answer, not the CV.
 */
export function isCandidateReportedEvidence(
  row: RequirementEvidenceRow,
  context: { originalRows: RequirementEvidenceRow[]; candidateAnswer: string | null },
): boolean {
  if (!context.candidateAnswer || row.evidence_strength === 'none') return false
  const excerpt = normalizeForComparison(row.evidence_found)
  if (!excerpt) return false

  // The original assessment never saw the answer, so an excerpt it quoted is CV text.
  const quotedBeforeAnswer = context.originalRows.some(
    (original) =>
      original.evidence_strength !== 'none' && normalizeForComparison(original.evidence_found).includes(excerpt),
  )
  if (quotedBeforeAnswer) return false

  if (normalizeForComparison(context.candidateAnswer).includes(excerpt)) return true

  // When unsure, prefer candidate reported: showing an answer as CV evidence is the error to avoid.
  const words = significantWords(row.evidence_found)
  if (words.length === 0) return false
  const answerWords = new Set(significantWords(context.candidateAnswer))
  const shared = words.filter((word) => answerWords.has(word)).length
  return shared / words.length >= ANSWER_OVERLAP_THRESHOLD
}

function sameRequirement(a: string, b: string): boolean {
  const left = normalizeForComparison(a)
  const right = normalizeForComparison(b)
  if (!left || !right) return false
  if (left === right) return true
  // gap_requirement is cut at 120 characters, so a long name may only match as a prefix.
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left]
  return shorter.length >= 100 && longer.startsWith(shorter)
}

/**
 * The requirements where the CV still leaves a recruiter question. A strongly
 * evidenced requirement is left to Strengths, unless the evidence for it came
 * from the follow up answer, which the candidate should see labelled as such.
 * The follow up's own requirement is listed first, since that is the one the
 * question below it is about.
 */
export function buildGapAnalysisRows(
  rows: RequirementEvidenceRow[],
  context: {
    originalRows: RequirementEvidenceRow[]
    candidateAnswer: string | null
    selectedRequirement: string | null
  },
): GapAnalysisRow[] {
  const provenance = { originalRows: context.originalRows, candidateAnswer: context.candidateAnswer }
  const gaps = rows.flatMap((row): GapAnalysisRow[] => {
    const fromAnswer = isCandidateReportedEvidence(row, provenance)
    if (row.evidence_strength === 'strong' && !fromAnswer) return []
    const original = fromAnswer
      ? context.originalRows.find((candidate) => sameRequirement(candidate.requirement, row.requirement))
      : undefined
    return [
      {
        requirement: row.requirement,
        cvShows: fromAnswer ? (original?.evidence_found ?? null) : row.evidence_found,
        candidateReported: fromAnswer ? row.evidence_found : null,
        recruiterRead: row.recruiter_interpretation,
        gap: row.gap_note,
      },
    ]
  })

  const selected = context.selectedRequirement
  const first = selected ? gaps.findIndex((gap) => sameRequirement(gap.requirement, selected)) : -1
  return first > 0 ? [gaps[first], ...gaps.slice(0, first), ...gaps.slice(first + 1)] : gaps
}
