// Evidence Follow Up: the rules every function and the report share, so they
// cannot disagree about which score a candidate has.
//
// A report always shows ONE score. The completed check row is immutable and
// keeps the original; a follow up that raised the score is stored on its own
// row (evidence_follow_ups) and overrides the original for display and for
// document eligibility. This module is where "does it override" is decided.
//
// Pure module: no Deno, no network, no environment access. The browser has a
// mirror in src/lib/evidenceFollowUp.ts (the src tree cannot import from
// here); a test in supabase/functions/_shared/follow-up-result.test.ts runs
// both against the same cases so they cannot drift.

import type { FollowUpVerdict, RequirementEvidenceRow } from '../analyze-check/logic.ts'

// The Needs Improvement band. Below it (Not a Fit) one answer rarely closes
// the gap; above it (Likely Interview Candidate) there is little to gain.
// Equal to NOT_A_FIT_MAX_SCORE + 1 and LIKELY_INTERVIEW_CANDIDATE_MIN_SCORE - 1
// in src/lib/documentEntitlement.ts, which the same test pins.
export const FOLLOW_UP_MIN_SCORE = 61
export const FOLLOW_UP_MAX_SCORE = 84

export function isFollowUpEligibleScore(score: unknown): score is number {
  return (
    typeof score === 'number' &&
    Number.isFinite(score) &&
    score >= FOLLOW_UP_MIN_SCORE &&
    score <= FOLLOW_UP_MAX_SCORE
  )
}

export interface FollowUpScoreOutcome {
  score: number
  // True only when the reassessment scored strictly higher.
  improved: boolean
}

// The most one follow up answer can add: it sharpens one requirement, it does not rewrite the score.
export const MAX_FOLLOW_UP_GAIN = 3

/** Situation, action and outcome are the core; a measurable result is welcome but never required. */
export function isMeaningfulFollowUpEvidence(verdict: FollowUpVerdict | null | undefined): boolean {
  return Boolean(
    verdict &&
      verdict.addresses_requirement &&
      verdict.situation &&
      verdict.action &&
      verdict.outcome &&
      verdict.new_information &&
      verdict.credible,
  )
}

/**
 * Every follow up re-runs the whole assessment, so a different result is often
 * model variation rather than something the answer revealed. Applied in code,
 * not only in a prompt: without meaningful new evidence the original score
 * stands; with it the score can rise by at most MAX_FOLLOW_UP_GAIN and never falls.
 */
export function applyFollowUpScoreLimits(
  initialScore: number,
  reassessedScore: number,
  meaningfulEvidence: boolean,
): FollowUpScoreOutcome {
  if (!meaningfulEvidence) return { score: initialScore, improved: false }
  const score = Math.min(Math.max(reassessedScore, initialScore), initialScore + MAX_FOLLOW_UP_GAIN)
  return { score, improved: score > initialScore }
}

export interface ReportResult {
  score: number
  strengths: string[]
  improvements: string[]
  prospects: string[]
  // Additive, new in prompt v7. Never part of the "does the follow up
  // replace the original" gate below — read defensively, default to [].
  requirementEvidence: RequirementEvidenceRow[]
  recruiterDoubts: string[]
}

export interface StoredFollowUp {
  status?: string | null
  final_score?: number | null
  final_strengths?: string[] | null
  final_improvements?: string[] | null
  final_prospects?: string[] | null
  final_requirement_evidence?: unknown
  final_recruiter_doubts?: string[] | null
}

export interface EffectiveResult extends ReportResult {
  // True when the follow up replaced the original score and feedback.
  updated: boolean
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isRequirementEvidenceRowArray(value: unknown): value is RequirementEvidenceRow[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as RequirementEvidenceRow).requirement === 'string' &&
        typeof (item as RequirementEvidenceRow).evidence_found === 'string' &&
        typeof (item as RequirementEvidenceRow).recruiter_interpretation === 'string',
    )
  )
}

/**
 * The one result a report, a list and a document generator should use.
 * The follow up replaces the original only when it is assessed, carries a
 * whole score strictly above the original, and carries its own feedback;
 * anything else (pending, processing, unchanged, malformed) leaves the
 * original untouched. The score and the feedback move together: a report
 * never shows one score beside the other score's findings.
 */
export function resolveEffectiveResult(base: ReportResult, followUp: StoredFollowUp | null | undefined): EffectiveResult {
  if (
    followUp &&
    followUp.status === 'assessed' &&
    typeof followUp.final_score === 'number' &&
    Number.isInteger(followUp.final_score) &&
    followUp.final_score > base.score &&
    followUp.final_score <= 100 &&
    isStringArray(followUp.final_strengths) &&
    isStringArray(followUp.final_improvements) &&
    isStringArray(followUp.final_prospects)
  ) {
    return {
      score: followUp.final_score,
      strengths: followUp.final_strengths,
      improvements: followUp.final_improvements,
      prospects: followUp.final_prospects,
      requirementEvidence: isRequirementEvidenceRowArray(followUp.final_requirement_evidence)
        ? followUp.final_requirement_evidence
        : [],
      recruiterDoubts: isStringArray(followUp.final_recruiter_doubts) ? followUp.final_recruiter_doubts : [],
      updated: true,
    }
  }
  return { ...base, updated: false }
}
