import { useState } from 'react'
import { Container } from '@/components/ui/Container'
import { Alert } from '@/components/ui/Alert'
import { PricingCards } from '@/components/ui/PricingCards'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/features/auth/context/AuthModalContext'
import { usePageMeta } from '@/hooks/usePageMeta'
import { CHECK_PACKS } from '@/lib/constants'
import { trackEvent } from '@/lib/analytics'
import { createCheckoutSession } from '@/services/checkService'
import type { CheckPack } from '@/types'

const faqs = [
  {
    question: 'Is there a free Recruiter Check?',
    answer: 'Yes. Every new account gets one free Recruiter Check, so you can see your Interview Score and recruiter style feedback before deciding whether you need more.',
  },
  {
    question: 'Is there a free keyword scan too?',
    answer: 'Yes. Before you spend a check, run a free keyword scan to see how well your CV matches a job description. You get 3 free scans, and unlimited scans once you’ve bought any check pack.',
  },
  {
    question: 'Do checks expire?',
    answer: 'Purchased checks are valid for 90 days from the date you buy them. Your free check never expires.',
  },
  {
    question: 'What happens when I run out?',
    answer: 'Buy another pack whenever you need to. There is no subscription and nothing renews automatically.',
  },
  {
    question: 'What happens to my uploaded CV?',
    answer: 'Uploads are deleted within 24 hours of being processed. See our Privacy Policy for full details on data retention.',
  },
  {
    question: 'What if I am not happy after paying?',
    answer: 'If your most recent pack is still fully unused and within 7 days of purchase, you can request a full refund from your billing page.',
  },
]

export function PricingPage() {
  usePageMeta({
    title: 'Pricing | MyRecruiterCheck',
    description: 'Simple, transparent pricing for Recruiter Checks. Your first check is free — check packs from €10, no subscription.',
    path: '/pricing',
  })

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
    <main>
      <section className="border-b border-border-soft bg-surface py-12 sm:py-16 lg:py-20">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue">Pricing</p>
            <h1 className="font-display mt-4 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl lg:text-[44px]">
              Choose how you use your checks
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-text-secondary">
              Your first Recruiter Check is free, no credit card required, plus 3 free keyword
              scans to check your fit before you spend one. After that, buy a pack of checks
              whenever you need them. No subscription and no automatic renewal.
            </p>
          </div>
        </Container>
      </section>

      <section className="py-10 sm:py-14">
        <Container>
          <div className="mx-auto">
            {error ? <Alert variant="error" className="mx-auto mb-6 max-w-2xl">{error}</Alert> : null}
            <PricingCards packs={CHECK_PACKS} loadingPack={loadingPack} onBuy={(packId) => void handleBuy(packId)} />
            <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-text-secondary">
              A Recruiter Check uses 1 check from your balance. Purchased checks expire 90 days after
              purchase.
            </p>
          </div>
        </Container>
      </section>

      <section className="border-t border-border-soft py-10 sm:py-14">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
              Frequently asked questions
            </h2>
            <div className="mt-8 divide-y divide-border rounded-[16px] border border-border-soft bg-surface shadow-card">
              {faqs.map((faq) => (
                <article key={faq.question} className="px-6 py-6">
                  <h3 className="text-lg font-semibold text-text-primary">{faq.question}</h3>
                  <p className="mt-3 leading-7 text-text-secondary">{faq.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </Container>
      </section>
    </main>
  )
}
