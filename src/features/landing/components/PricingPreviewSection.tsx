import { useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Container } from '@/components/ui/Container'
import { PricingCards } from '@/components/ui/PricingCards'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/features/auth/context/AuthModalContext'
import { CHECK_PACKS } from '@/lib/constants'
import { trackEvent } from '@/lib/analytics'
import { createCheckoutSession } from '@/services/checkService'
import type { CheckPack } from '@/types'

/**
 * Reuses the exact PricingCards component and buy flow from PricingPage.tsx
 * (not a re-styled copy) so this section can never visually drift from the
 * real pricing page, and so a visitor can buy directly from the homepage
 * instead of only linking out to /pricing.
 */
export function PricingPreviewSection() {
  const { user } = useAuth()
  const { open } = useAuthModal()
  const [loadingPack, setLoadingPack] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleBuy(packId: CheckPack['id']) {
    if (!user) {
      open('sign-up')
      return
    }

    setLoadingPack(packId)
    setError(null)
    trackEvent('checkout_started')

    try {
      const url = await createCheckoutSession(packId)
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout')
      setLoadingPack(null)
    }
  }

  return (
    <section className="border-b border-border bg-surface">
      <Container className="py-[32px] sm:py-12 lg:py-[64px]">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue">Pricing</p>
          <h2 className="mt-2 font-display text-[20px] font-semibold tracking-tight text-text-primary sm:text-3xl">
            One time credit packs, no subscription
          </h2>
          <p className="mt-3 text-[14px] text-text-secondary sm:text-base">
            Buy checks in bursts to match how you actually job hunt. No recurring charge, no auto-renewal.
          </p>
        </div>

        <div className="mx-auto mt-5 max-w-4xl sm:mt-8">
          {error ? <Alert variant="error" className="mb-4">{error}</Alert> : null}
          <PricingCards packs={CHECK_PACKS} loadingPack={loadingPack} onBuy={(packId) => void handleBuy(packId)} />
        </div>

        <p className="mx-auto mt-4 max-w-3xl text-center text-xs text-text-secondary">
          Your first check is free, no card required.
        </p>
      </Container>
    </section>
  )
}
