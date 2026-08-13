export const BRAND = {
  name: 'MyRecruiterCheck',
  tagline: 'Think like a recruiter before you apply.',
  // Production domain not yet provisioned — update once a new domain/Vercel
  // URL is live, and keep Supabase auth redirect URLs and edge function CORS
  // origins in sync with it at that time.
  canonicalUrl: 'https://recruitercheck.vercel.app',
} as const

export const FEATURE_FLAGS = {
  linkedInAuth: false,
} as const

import type { PricingPlan } from '@/types'

const PREMIUM_FEATURES = [
  'Up to 8 Recruiter Checks per day',
  'Interview Probability',
  'Recruiter Feedback',
  'Tailored CVs',
  'Cover Letters',
  'Recruiter Messages',
]

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'free' as const,
    name: 'Free',
    price: '€0',
    description: 'Get started with your first Recruiter Check.',
    features: ['1 Recruiter Check', 'Interview Probability', 'Recruiter Feedback'],
  },
  {
    id: 'premium_weekly' as const,
    name: 'Weekly',
    price: '€9.99',
    interval: 'week',
    description: 'More checks when you are actively applying.',
    features: PREMIUM_FEATURES,
  },
  {
    id: 'premium_monthly' as const,
    name: 'Monthly',
    price: '€19.99',
    interval: 'month',
    description: 'Best value for an active job search.',
    features: [
      'Up to 8 Recruiter Checks per day',
      'Everything in Weekly',
      'Best value for an active job search.',
    ],
    badge: 'Best Value',
    highlighted: true,
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
