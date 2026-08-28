import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { JobsYouCanCheckSection } from '@/features/landing/components/JobsYouCanCheckSection'
import { ClosingCtaSection } from '@/features/landing/components/ClosingCtaSection'
import { DashboardShowcase } from '@/features/landing/components/DashboardShowcase'
import { DocumentShowcase } from '@/features/landing/components/DocumentShowcase'
import { HeroSection } from '@/features/landing/components/HeroSection'
import { HowItWorksSection } from '@/features/landing/components/HowItWorksSection'
import { LlmComparisonSection } from '@/features/landing/components/LlmComparisonSection'
import { ReassuranceSection } from '@/features/landing/components/ReassuranceSection'
import { RoleFeedbackShowcase } from '@/features/landing/components/RoleFeedbackShowcase'
import { StatsSection } from '@/features/landing/components/StatsSection'
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
      <Reveal>
        <HowItWorksSection />
      </Reveal>
      {/* Straight after the mechanism: "does this apply to my job?". Answering
          that here qualifies the visitor before the three demo sections. */}
      <Reveal>
        <JobsYouCanCheckSection />
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
      {/* Proof before the close. Pricing is no longer previewed here at all,
          it lives on /pricing, where these same reviews sit under the packs. */}
      <Reveal>
        <TestimonialsSection />
      </Reveal>
      {/* Live from day one: product commitments until real volume clears
          the floor, then the same grid swaps to usage figures. */}
      <Reveal>
        <StatsSection />
      </Reveal>
      {/* Third-party credibility right before the ask: the official
          Trustpilot collector, on a verified business profile. The same ask
          also lives on FeedbackPage after a completed check, where the
          reviews it collects actually come from. */}
      <Reveal>
        <TrustpilotFeedbackSection />
      </Reveal>
      {/* The objection strip works hardest next to the ask, not before the
          visitor knows what the product is — deletion, refunds and the
          ChatGPT comparison are answers to late-stage hesitation. */}
      <ReassuranceSection />
      <Reveal>
        <ClosingCtaSection />
      </Reveal>
    </>
  )
}
