// Gap Analysis: the one requirement the Evidence Follow Up asks about. Pure and
// DOM free so it can be unit tested with the tsx runner.

import type { RequirementEvidenceRow } from '@/types'

export const GAP_ANALYSIS_TITLE = 'Gap Analysis'
export const GAP_ANALYSIS_SUBTITLE =
  'We checked the important requirements in the job description against your CV. This is the gap that matters most.'

export interface GapAnalysisItem {
  requirement: string
  // What is missing, in one line. Null when the CV only assessment has no row for it.
  detail: string | null
}

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%€$£\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
 * The gap the initial analysis selected for the follow up, described from that
 * CV only assessment and never from a reassessment: an answer does not change
 * the CV, and the answer itself is shown, labelled, in the follow up card.
 * Null when no gap was selected, so none is ever invented.
 */
export function buildGapAnalysisItem(
  originalRows: RequirementEvidenceRow[],
  gapRequirement: string | null | undefined,
): GapAnalysisItem | null {
  const requirement = gapRequirement?.trim()
  if (!requirement) return null
  const row = originalRows.find((candidate) => sameRequirement(candidate.requirement, requirement))
  return { requirement, detail: row?.gap_note?.trim() || row?.recruiter_interpretation?.trim() || null }
}
