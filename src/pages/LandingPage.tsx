import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { ClosingCtaSection } from '@/features/landing/components/ClosingCtaSection'
import { ExampleCheckTeaser } from '@/features/landing/components/ExampleCheckTeaser'
import { HeroSection } from '@/features/landing/components/HeroSection'
import { HowItWorksSection } from '@/features/landing/components/HowItWorksSection'
import { trackEvent } from '@/lib/analytics'
import { usePageMeta } from '@/hooks/usePageMeta'

export function LandingPage() {
  const location = useLocation()

  usePageMeta({
    title: 'MyRecruiterCheck — Think like a recruiter before you apply.',
    description:
      'MyRecruiterCheck compares your CV with a specific job description and gives you recruiter-style feedback — an Interview Probability, Strengths, Areas to Improve, and Prospects — before you apply.',
    path: '/',
  })

  useEffect(() => {
    if (location.pathname === '/') trackEvent('landing_view')
  }, [location.pathname])

  return (
    <>
      <HeroSection />
      <HowItWorksSection />
      <ExampleCheckTeaser />
      <ClosingCtaSection />
    </>
  )
}
