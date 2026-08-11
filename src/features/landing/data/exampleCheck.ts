/**
 * Fully fictional demo content for the public Example Recruiter Check page.
 * No production data, no database query, no OpenAI call — this is a static
 * illustration of what the real Feedback page produces after a check.
 */
export const EXAMPLE_CANDIDATE_NAME = 'Alex Morgan'
export const EXAMPLE_JOB_TITLE = 'Product Marketing Manager'
export const EXAMPLE_COMPANY_NAME = 'Northstar Technologies'

export const EXAMPLE_CHECK = {
  score: 64,
  strengths: [
    "Relevant industry experience. Alex's five years in B2B software marketing at Beacon Software closely match what Northstar Technologies is looking for.",
    'Clear career progression. Each role shows increasing scope, from marketing coordinator to senior marketing manager.',
  ],
  improvements: [
    "Quantify your impact. In your role at Beacon Software, you mention leading product launches but don't show the result. Example: Led the Q3 product launch, increasing signups by X% within X months.",
    "Show cross-functional collaboration. The job description asks for close work with sales and product teams, but your CV doesn't mention working with either. Example: Partnered with sales and product teams to align go-to-market messaging for three major releases.",
    'Tighten your summary. Your CV opens with a general career summary rather than one focused on product marketing. Example: Product marketing manager with five years of B2B experience turning positioning into pipeline.',
  ],
  prospects: [
    'Strong candidate for mid-level product marketing roles at B2B software companies.',
    'Highlighting metrics-driven results would strengthen applications for senior-level positions.',
  ],
} as const
