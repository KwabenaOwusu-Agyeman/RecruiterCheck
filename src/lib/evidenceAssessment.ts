// Presentation rules for the Evidence Assessment card. Pure and DOM free so
// they can be unit tested with the tsx runner.

import type { RequirementEvidenceRow } from '@/types'

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

function normalizeSentence(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Drops a doubt that repeats, word for word, a recruiter read or gap the card already shows. */
export function distinctRecruiterDoubts(doubts: string[], rows: RequirementEvidenceRow[]): string[] {
  const alreadyShown = new Set(
    rows.flatMap((row) => [row.recruiter_interpretation, row.gap_note ?? '']).map(normalizeSentence).filter(Boolean),
  )
  const kept = new Set<string>()
  return doubts.filter((doubt) => {
    const key = normalizeSentence(doubt)
    if (!key || alreadyShown.has(key) || kept.has(key)) return false
    kept.add(key)
    return true
  })
}
