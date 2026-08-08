import { ClosingCtaSection } from '@/features/landing/components/ClosingCtaSection'
import { HeroSection } from '@/features/landing/components/HeroSection'
import { HowItWorksSection } from '@/features/landing/components/HowItWorksSection'

export function LandingPage() {
  return (
    <>
      <HeroSection />
      <HowItWorksSection />
      <ClosingCtaSection />
    </>
  )
}
