import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { ClosingCtaSection } from '@/features/landing/components/ClosingCtaSection'
import { DashboardShowcase } from '@/features/landing/components/DashboardShowcase'
import { DocumentShowcase } from '@/features/landing/components/DocumentShowcase'
import { HeroSection } from '@/features/landing/components/HeroSection'
import { HowItWorksSection } from '@/features/landing/components/HowItWorksSection'
import { LlmComparisonSection } from '@/features/landing/components/LlmComparisonSection'
import { PricingPreviewSection } from '@/features/landing/components/PricingPreviewSection'
import { ReassuranceSection } from '@/features/landing/components/ReassuranceSection'
import { RoleFeedbackShowcase } from '@/features/landing/components/RoleFeedbackShowcase'
import { TestimonialsSection } from '@/features/landing/components/TestimonialsSection'
import { TrustpilotFeedbackSection } from '@/features/landing/components/TrustpilotFeedbackSection'
import { Reveal } from '@/components/ui/Reveal'
import { trackEvent } from '@/lib/analytics'
import { usePageMeta } from '@/hooks/usePageMeta'

export function LandingPage() {
  const location = useLocation()

  usePageMeta({
    title: 'MyRecruiterCheck | CV Checker for Tech, AI and Data Roles',
    description:
      'MyRecruiterCheck compares your CV with a specific tech, AI, machine learning or data job and shows how clearly your application demonstrates the experience, skills and candidate value the role requires, before you apply.',
    path: '/',
  })

  useEffect(() => {
    if (location.pathname === '/') trackEvent('landing_view')
  }, [location.pathname])

  // React Router's client-side navigation doesn't trigger the browser's
  // native scroll-to-hash behavior when the target page (this one) mounts
  // fresh from a different route — e.g. the "See an example" link on the 23
  // SEO job-title pages links to /#example. Scroll to the hash target
  // ourselves once it's in the DOM.
  useEffect(() => {
    if (!location.hash) return
    const el = document.getElementById(location.hash.slice(1))
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }, [location.pathname, location.hash])

  return (
    <>
      <HeroSection />
      <ReassuranceSection />
      <Reveal>
        <HowItWorksSection />
      </Reveal>
      <Reveal>
        <RoleFeedbackShowcase />
      </Reveal>
      <Reveal>
        <LlmComparisonSection />
      </Reveal>
      <Reveal>
        <DocumentShowcase />
      </Reveal>
      <Reveal>
        <DashboardShowcase />
      </Reveal>
      <Reveal>
        <TrustpilotFeedbackSection />
      </Reveal>
      <Reveal>
        <PricingPreviewSection />
      </Reveal>
      <Reveal>
        <TestimonialsSection />
      </Reveal>
      <Reveal>
        <ClosingCtaSection />
      </Reveal>
    </>
  )
}
