export const BRAND = {
  name: 'RecruiterCheck',
  tagline: 'Think like a recruiter before you apply.',
} as const

export const FEATURE_FLAGS = {
  linkedInAuth: false,
} as const

import type { PricingPlan } from '@/types'

const PREMIUM_FEATURES = [
  'Up to 8 Recruiter Checks per day',
  'Interview Probability Score',
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
    features: ['1 Recruiter Check', 'Interview Probability Score', 'Recruiter Feedback'],
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
