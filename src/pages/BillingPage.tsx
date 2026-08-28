import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { BackLink } from '@/components/ui/BackLink'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PricingCards } from '@/components/ui/PricingCards'
import { TestimonialsSection } from '@/features/landing/components/TestimonialsSection'
import { CHECK_PACKS } from '@/lib/constants'
import { trackEvent } from '@/lib/analytics'
import { useAuth } from '@/hooks/useAuth'
import { usePageMeta } from '@/hooks/usePageMeta'
import { createCheckoutSession, requestRefund } from '@/services/checkService'

export function BillingPage() {
  usePageMeta({ title: 'Billing | MyRecruiterCheck', description: 'Manage your MyRecruiterCheck check packs and billing.', path: '/account/billing', noindex: true })
  const { profile, refreshProfile } = useAuth()
  const [searchParams] = useSearchParams()
  const [loadingPack, setLoadingPack] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refundDialogOpen, setRefundDialogOpen] = useState(false)
  const [refundLoading, setRefundLoading] = useState(false)
  const [refundSuccess, setRefundSuccess] = useState(false)

  const checkoutStatus = searchParams.get('status')

  useEffect(() => {
    // A brand new purchase lands here after a Stripe Checkout redirect — the
    // webhook grants the credits, but this tab's `profile` was loaded before
    // that happened, so it must be re-fetched or the balance keeps showing
    // stale (pre-purchase) numbers until a hard reload.
    if (checkoutStatus === 'success') {
      trackEvent('purchase_completed')
      void refreshProfile()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutStatus])

  async function handleBuy(packId: (typeof CHECK_PACKS)[number]['id']) {
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

  async function confirmRequestRefund() {
    setRefundLoading(true)
    setError(null)

    try {
      await requestRefund()
      setRefundDialogOpen(false)
      setRefundSuccess(true)
      trackEvent('refund_requested')
      await refreshProfile()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process your refund')
    } finally {
      setRefundLoading(false)
    }
  }

  return (
    <>
      <BackLink to="/account" />

      <div className="mx-auto mt-1 max-w-2xl text-center lg:max-w-[1080px]">
        <p className="text-xs font-bold uppercase tracking-wider text-blue">Check Packs</p>
        <h1 className="font-display mt-1.5 text-2xl font-bold tracking-tight text-text-primary sm:text-[32px]">
          {profile ? `${profile.checks_balance} checks remaining` : 'Your check balance'}
        </h1>
        <p className="mx-auto mt-2 max-w-none text-sm text-text-secondary sm:whitespace-nowrap sm:text-base">
          One-time payment. No subscription. No automatic renewal.
        </p>
      </div>

      {checkoutStatus === 'success' ? (
        <Alert variant="success" className="mx-auto mt-6 max-w-2xl">
          Payment received. Your checks will appear shortly.
        </Alert>
      ) : null}

      {checkoutStatus === 'cancelled' ? (
        <Alert variant="info" className="mx-auto mt-6 max-w-2xl">
          Checkout was cancelled. No changes were made.
        </Alert>
      ) : null}

      {refundSuccess ? (
        <Alert variant="success" className="mx-auto mt-6 max-w-2xl">
          Your refund has been processed. It may take a few business days to appear on your
          statement.
        </Alert>
      ) : null}

      {error ? <Alert variant="error" className="mx-auto mt-6 max-w-2xl">{error}</Alert> : null}

      {/* Breaks out of AppLayout's own 1120px cap so the three cards get the
          same 1400px breathing room PricingPage.tsx already gives this exact
          component — the classic full-bleed-then-recenter trick, since
          AppLayout wraps every account/* page in one shared Container we
          shouldn't widen globally just for this one section. */}
      <div className="relative w-screen" style={{ left: 'calc(-50vw + 50%)' }}>
        <div className="mx-auto max-w-[1400px] px-[16px] sm:px-6 lg:px-[32px]">
          <PricingCards packs={CHECK_PACKS} loadingPack={loadingPack} onBuy={(packId) => void handleBuy(packId)} />
        </div>
      </div>

      {/* Same reviews the landing and pricing pages show, directly under the
          packs so the proof is there at the moment of deciding. Full-bleed by
          the same trick as the cards above: TestimonialsSection brings its own
          Container, so nesting it inside AppLayout's would double the padding. */}
      <div className="relative w-screen" style={{ left: 'calc(-50vw + 50%)' }}>
        <TestimonialsSection compact />
      </div>

      <ConfirmDialog
        open={refundDialogOpen}
        title="Request a refund?"
        description="If your most recent pack is still fully unused and within 7 days of purchase, we'll refund that payment in full. This can't be undone."
        confirmLabel="Request refund"
        confirmingLabel="Processing..."
        cancelLabel="Never mind"
        busy={refundLoading}
        destructive
        onConfirm={() => void confirmRequestRefund()}
        onCancel={() => setRefundDialogOpen(false)}
      />

      <div className="mt-6 flex flex-col items-center gap-1.5 text-center text-xs text-text-secondary">
        <div className="flex items-center gap-1.5">
          <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
            <path
              d="M5 9V6.5a5 5 0 0 1 10 0V9m-11 0h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Payments securely processed by Stripe. We never see or store your card details.</span>
        </div>
        <span>
          Not happy with your last purchase?{' '}
          <button
            type="button"
            className="font-medium text-blue hover:underline"
            onClick={() => setRefundDialogOpen(true)}
          >
            Request a refund
          </button>
        </span>
        <span>
          Have questions?{' '}
          <Link to="/faq" className="font-medium text-blue hover:underline">
            Read the FAQ
          </Link>
        </span>
      </div>
    </>
  )
}
