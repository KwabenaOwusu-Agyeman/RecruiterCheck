import { HeroSection } from '@/features/landing/components/HeroSection'
import { HowItWorksSection } from '@/features/landing/components/HowItWorksSection'
import { ReviewsSection } from '@/features/landing/components/ReviewsSection'

export function LandingPage() {
  return (
    <>
      <HeroSection />
      <HowItWorksSection />
      <ReviewsSection />
    </>
  )
}
