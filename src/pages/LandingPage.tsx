import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { ClosingCtaSection } from '@/features/landing/components/ClosingCtaSection'
import { DocumentShowcase } from '@/features/landing/components/DocumentShowcase'
import { HeroSection } from '@/features/landing/components/HeroSection'
import { HowItWorksSection } from '@/features/landing/components/HowItWorksSection'
import { LlmComparisonSection } from '@/features/landing/components/LlmComparisonSection'
import { ReassuranceSection } from '@/features/landing/components/ReassuranceSection'
import { RoleFeedbackShowcase } from '@/features/landing/components/RoleFeedbackShowcase'
import { TestimonialsSection } from '@/features/landing/components/TestimonialsSection'
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
      {/* The order is the argument: the hero hooks, How it works states the
          mechanism (CV plus job in, score and fixes out), then the verdict
          trio proves the output before anything is claimed about it — three
          real-looking results, including a "Not a Fit", are the evidence
          that makes the comparison matrix's rows read as checked facts
          rather than assertions. Us vs ChatGPT follows the proof, then the
          documents, then the human proof, then the ask.

          Deliberately absent (each earned its removal, don't re-add without
          new evidence): the jobs ticker (recognition already delivered by
          the hero capsule and the trio's role titles, and it carried a
          competing CTA), the dashboard showcase (Before/Add/Track reframed
          a pre-apply check as a tracking platform — it lives on
          /application-checker), the stats grid (product facts posing as
          usage figures; its one real fact, the three scoring dimensions,
          moved into the hero, and its component, service and RPC were
          deleted on 31 August rather than left dormant), and the
          Trustpilot collector (it asked
          strangers for reviews — it stays on FeedbackPage, where reviews
          actually come from). */}
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
      {/* Proof before the close. Pricing is no longer previewed here at all,
          it lives on /pricing, where these same reviews sit under the packs. */}
      <Reveal>
        <TestimonialsSection />
      </Reveal>
      {/* The objection strip works hardest next to the ask, not before the
          visitor knows what the product is — deletion, refunds and the
          ChatGPT comparison are answers to late-stage hesitation. The navy
          strip sits a full section-height of cream above the navy closing
          card, which keeps the two from reading as one stacked block. */}
      <ReassuranceSection />
      <Reveal>
        <ClosingCtaSection />
      </Reveal>
    </>
  )
}
