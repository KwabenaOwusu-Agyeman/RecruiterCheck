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
  // True when blockedReason is about needing to buy a pack (or a better
  // one), so the Recommendation card should offer a direct link to pricing
  // alongside it. False for Not a Fit on a paid pack: buying more checks
  // would not change that result, so no pricing push belongs next to it.
  showPricingCta: boolean
}

// This exact wording is what a paid Not a Fit user already sees; the free
// tier variant below reuses it so the two read as the same fact, not two
// different explanations of the same result.
const NOT_A_FIT_EXPLANATION =
  'This score suggests the role is not a strong match for your current CV, so we do not generate a CV draft, cover letter, or recruiter message for it. Look for a role that better fits your experience, then run a new Recruiter Check.'

export function getDocumentEntitlement(fundingPackId: FundingPackId, score: number | null): DocumentEntitlement {
  const hasAnyPackEntitlement = fundingPackId === 'small' || fundingPackId === 'medium' || fundingPackId === 'large'

  if (!hasAnyPackEntitlement) {
    // The free tier message must vary by score, mirroring exactly what a
    // paid user would be told at that same score group — otherwise a free
    // user could buy a pack expecting a document this score will never
    // produce (an Improved CV Draft at 85+, for example, which no pack ever
    // includes). Every free tier branch offers the pricing CTA regardless of
    // score: unlike the paid Not a Fit case, this candidate genuinely has
    // never seen what a pack includes.
    if (score !== null && score <= NOT_A_FIT_MAX_SCORE) {
      return {
        cv: false,
        coverLetter: false,
        recruiterMessage: false,
        blockedReason: `${NOT_A_FIT_EXPLANATION} A paid check pack would not change that for this specific result.`,
        showPricingCta: true,
      }
    }
    if (score !== null && score >= LIKELY_INTERVIEW_CANDIDATE_MIN_SCORE) {
      return {
        cv: false,
        coverLetter: false,
        recruiterMessage: false,
        blockedReason: `Your Interview Score is already strong for this role, so an Improved CV Draft is not offered at this score. Buy the ${getPackDisplayName('large')} pack for a Cover Letter and Recruiter Message.`,
        showPricingCta: true,
      }
    }
    return {
      cv: false,
      coverLetter: false,
      recruiterMessage: false,
      blockedReason:
        'This check includes your Interview Score and Recruiter Feedback. Buy a check pack to also get an Improved CV Draft, Cover Letter, and Recruiter Message.',
      showPricingCta: true,
    }
  }

  if (score === null || score <= NOT_A_FIT_MAX_SCORE) {
    return {
      cv: false,
      coverLetter: false,
      recruiterMessage: false,
      blockedReason: NOT_A_FIT_EXPLANATION,
      // Already paid: buying another pack would not change a Not a Fit
      // result, so no pricing push belongs here.
      showPricingCta: false,
    }
  }

  const isLikelyInterviewCandidate = score >= LIKELY_INTERVIEW_CANDIDATE_MIN_SCORE

  const entitlement = {
    cv: hasAnyPackEntitlement && !isLikelyInterviewCandidate,
    coverLetter: fundingPackId === 'large',
    recruiterMessage: fundingPackId === 'large',
  }

  if (!entitlement.cv && !entitlement.coverLetter && !entitlement.recruiterMessage) {
    return {
      ...entitlement,
      blockedReason: `Your Interview Score is already strong for this role, so an Improved CV Draft is not offered at this score. Upgrade to the ${getPackDisplayName('large')} pack for a Cover Letter and Recruiter Message.`,
      // Paid but not Power, and Power would unlock something real here
      // (Cover Letter and Recruiter Message), unlike the Not a Fit case.
      showPricingCta: true,
    }
  }

  return { ...entitlement, blockedReason: null, showPricingCta: false }
}
