export const BRAND = {
  name: 'MyRecruiterCheck',
  tagline: 'Think like a recruiter before you apply.',
  // Deliberately staying on the vercel.app subdomain for now (custom domain
  // owned but not yet connected). If that changes, also update index.html,
  // public/sitemap.xml, public/robots.txt, and the Supabase auth redirect
  // URLs / edge function CORS origins — none of those derive from this value.
  canonicalUrl: 'https://recruitercheck.vercel.app',
} as const

export const FEATURE_FLAGS = {
  linkedInAuth: false,
} as const

import type { PricingPlan } from '@/types'

// Kept in sync with PLAN_PRICES in create-checkout-session and
// PLAN_CHECK_LIMITS in stripe-webhook.
export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'free' as const,
    name: 'Free',
    price: '€0',
    description: 'Get started with your first Recruiter Check.',
    features: ['1 Recruiter Check', 'Interview Probability', 'Recruiter Feedback'],
  },
  {
    id: 'starter' as const,
    name: 'Starter',
    price: '€10',
    interval: 'week',
    description: 'Get your applications moving.',
    features: ['5 Recruiter Checks per week', 'Interview Probability Score', 'Recruiter Feedback'],
    perCheckPrice: '€2.00 / check',
  },
  {
    id: 'active' as const,
    name: 'Active',
    price: '€15',
    interval: 'week',
    description: 'For a job search in full swing.',
    features: [
      '10 Recruiter Checks per week',
      'Interview Probability Score',
      'Recruiter Feedback',
      'Improved CV Draft',
    ],
    badge: 'Most Popular',
    highlighted: true,
    perCheckPrice: '€1.50 / check',
    highlightFeature: 'Improved CV Draft',
  },
  {
    id: 'power' as const,
    name: 'Power',
    price: '€20',
    interval: 'week',
    description: 'For applying at volume.',
    features: [
      '20 Recruiter Checks per week',
      'Everything in Active',
      'Cover Letter',
      'Recruiter Message',
      'Access to check history',
    ],
    badge: 'Best Value',
    perCheckPrice: '€1.00 / check',
    highlightFeature: 'Access to check history',
  },
]

export const ACCEPTED_CV_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const

export const MAX_CV_SIZE_BYTES = 10 * 1024 * 1024

export const ACCEPTED_JOB_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
] as const

export const MAX_JOB_FILE_SIZE_BYTES = 10 * 1024 * 1024
