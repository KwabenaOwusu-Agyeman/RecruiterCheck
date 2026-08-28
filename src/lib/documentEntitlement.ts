import type { FundingPackId } from '@/types'
import { getPackDisplayName } from './constants'

// Frontend mirror of getDocumentEntitlement in
// supabase/functions/generate-documents/logic.ts — kept in sync by hand,
// the same established pattern this codebase already uses for score group
// thresholds duplicated across the Vite frontend and Deno edge functions
// (separate deploy units, no shared module boundary). This is display only:
// the Edge Function is the actual, authoritative enforcement point, and a
// direct API call is checked against that copy, not this one. If the two
// ever disagree, the UI might show a document as available that the server
// then refuses (never the reverse risk of concern — worst case is a
// generate click that 403s, not a bypass).
//
// A document is only ever available when BOTH:
//  1. The pack that funded this check entitles it.
//  2. The check's own score group permits it.
//
// Rules:
//  - Not a Fit (score 0-60): no CV, no cover letter, no recruiter message,
//    regardless of pack.
//  - Needs Improvement (61-84): CV/cover letter/recruiter message each
//    permitted when the pack entitles them.
//  - Likely Interview Candidate (85-100): CV never permitted, regardless of
//    pack; cover letter/recruiter message permitted when the pack entitles
//    them.

export const NOT_A_FIT_MAX_SCORE = 60
export const LIKELY_INTERVIEW_CANDIDATE_MIN_SCORE = 85

export interface DocumentEntitlement {
  cv: boolean
  coverLetter: boolean
  recruiterMessage: boolean
  // A short, canonical (Starter/Active/Power, never small/medium/large)
  // reason to show the user when nothing is available.
  blockedReason: string | null
}

export function getDocumentEntitlement(fundingPackId: FundingPackId, score: number | null): DocumentEntitlement {
  const hasAnyPackEntitlement = fundingPackId === 'small' || fundingPackId === 'medium' || fundingPackId === 'large'

  if (!hasAnyPackEntitlement) {
    return {
      cv: false,
      coverLetter: false,
      recruiterMessage: false,
      blockedReason:
        'This check includes your Interview Score and Recruiter Feedback. Buy a check pack to also get an Improved CV Draft, Cover Letter, and Recruiter Message.',
    }
  }

  if (score === null || score <= NOT_A_FIT_MAX_SCORE) {
    return {
      cv: false,
      coverLetter: false,
      recruiterMessage: false,
      blockedReason:
        'Documents are only generated for a score of 61 or above. A lower score means this role is not a strong match for your CV.',
    }
  }

  const isLikelyInterviewCandidate = score >= LIKELY_INTERVIEW_CANDIDATE_MIN_SCORE

  const entitlement: DocumentEntitlement = {
    cv: hasAnyPackEntitlement && !isLikelyInterviewCandidate,
    coverLetter: fundingPackId === 'large',
    recruiterMessage: fundingPackId === 'large',
    blockedReason: null,
  }

  if (!entitlement.cv && !entitlement.coverLetter && !entitlement.recruiterMessage) {
    return {
      ...entitlement,
      blockedReason: `Your Interview Score is already strong for this role, so an Improved CV Draft is not offered at this score. Upgrade to the ${getPackDisplayName('large')} pack for a Cover Letter and Recruiter Message.`,
    }
  }

  return entitlement
}
