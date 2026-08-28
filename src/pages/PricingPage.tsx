import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Container } from '@/components/ui/Container'
import { PricingCards } from '@/components/ui/PricingCards'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/features/auth/context/AuthModalContext'
import { usePageMeta } from '@/hooks/usePageMeta'
import { TestimonialsSection } from '@/features/landing/components/TestimonialsSection'
import { CHECK_PACKS } from '@/lib/constants'
import { trackEvent } from '@/lib/analytics'
import { createCheckoutSession, requestRefund } from '@/services/checkService'
import type { CheckPack } from '@/types'

/**
 * The single pricing page, for signed-out and signed-in visitors alike.
 *
 * This absorbed the old /account/billing page, which rendered the same
 * PricingCards from the same CHECK_PACKS behind ProtectedRoute. Billing now
 * redirects here (see App.tsx). This page kept the merge rather than the
 * other way around because it is public and prerendered: putting the only
 * copy of the prices behind auth would have hidden them from every
 * signed-out visitor and dropped an indexed page.
 *
 * Signed-in extras (balance, checkout result, refund) render only when there
 * is a user, so the prerendered signed-out HTML is unchanged.
 */
export function PricingPage() {
  usePageMeta({
    title: 'Pricing | MyRecruiterCheck',
    description: 'Simple, transparent pricing for Recruiter Checks. Your first check is free, check packs from €10, no subscription.',
    path: '/pricing',
  })

  const { user, profile, refreshProfile } = useAuth()
  const { open } = useAuthModal()
  const [searchParams] = useSearchParams()
  const [loadingPack, setLoadingPack] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refundDialogOpen, setRefundDialogOpen] = useState(false)
  const [refundLoading, setRefundLoading] = useState(false)
  const [refundSuccess, setRefundSuccess] = useState(false)

  const checkoutStatus = searchParams.get('status')

  useEffect(() => {
    trackEvent('pricing_viewed')
  }, [])

  useEffect(() => {
    // A brand new purchase lands back here after the Stripe Checkout redirect
    // (see create-checkout-session's success_url) — the webhook grants the
    // credits, but this tab's `profile` was loaded before that happened, so
    // it must be re-fetched or the balance keeps showing stale numbers.
    if (checkoutStatus === 'success') {
      trackEvent('purchase_completed')
      void refreshProfile()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutStatus])

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
    <main>
      <section className="border-b border-border-soft bg-background py-[40px] sm:py-12">
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            {/* Framed as support rather than payment. The word "Pricing" still
                lives in the <title> and the URL, which is what carries the
                pricing search intent, so the visible copy is free to be human.

                No "free check" language: every signed-in visitor here has
                already spent theirs (all accounts show lifetime_checks_consumed
                >= 1), so leading with it would be stale news. The commercial
                terms it used to carry are not lost, since each pack card
                already reads "One time purchase, credits valid for 90 days". */}
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue sm:text-sm">
              Support for your applications
            </p>
            {/* Same heading for everyone: it is what the prerendered page ships
                and what search results show. The balance is added below it
                rather than replacing it. */}
            <h1 className="font-display mt-2 text-[26px] text-text-primary sm:text-[34px] lg:text-[40px] lg:leading-[1.15]">
              Choose how much support you want for your applications
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-[15px] leading-7 text-text-secondary sm:text-base">
              Pick the pack that fits your search, and use your checks whenever you need them.
            </p>
            {profile ? (
              <p className="mt-3 text-sm font-semibold text-text-primary">
                You have {profile.checks_balance} {profile.checks_balance === 1 ? 'check' : 'checks'} remaining.
              </p>
            ) : null}
          </div>
        </Container>
      </section>

      <section className="py-5 sm:py-6">
        <Container className="lg:max-w-[1400px]">
          <div className="mx-auto">
            {checkoutStatus === 'success' ? (
              <Alert variant="success" className="mx-auto mb-6 max-w-2xl">
                Payment received. Your checks will appear shortly.
              </Alert>
            ) : null}

            {checkoutStatus === 'cancelled' ? (
              <Alert variant="info" className="mx-auto mb-6 max-w-2xl">
                Checkout was cancelled. No changes were made.
              </Alert>
            ) : null}

            {refundSuccess ? (
              <Alert variant="success" className="mx-auto mb-6 max-w-2xl">
                Your refund has been processed. It may take a few business days to appear on your
                statement.
              </Alert>
            ) : null}

            {error ? <Alert variant="error" className="mx-auto mb-6 max-w-2xl">{error}</Alert> : null}

            <PricingCards packs={CHECK_PACKS} loadingPack={loadingPack} onBuy={(packId) => void handleBuy(packId)} />
          </div>
        </Container>
      </section>

      {/* Same reviews component the landing page uses. Placed directly below
          the packs so anyone arriving from a "Get checks" CTA sees the proof
          at the moment they are choosing. */}
      <TestimonialsSection compact />

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

      <Container className="py-8">
        <div className="flex flex-col items-center gap-1.5 text-center text-xs text-text-secondary">
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
          {/* Only offered to someone who could actually have a purchase to refund. */}
          {user ? (
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
          ) : null}
          <span>
            Have questions?{' '}
            <Link to="/faq" className="font-medium text-blue hover:underline">
              Read the FAQ
            </Link>
          </span>
        </div>
      </Container>
    </main>
  )
}
