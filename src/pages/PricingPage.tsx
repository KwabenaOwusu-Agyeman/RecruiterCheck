import { useNavigate } from 'react-router-dom'
import { Container } from '@/components/ui/Container'
import { PricingCards } from '@/components/ui/PricingCards'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/features/auth/context/AuthModalContext'
import { usePageMeta } from '@/hooks/usePageMeta'
import { PRICING_PLANS } from '@/lib/constants'

const faqs = [
  {
    question: 'Is there a free Recruiter Check?',
    answer: 'Yes. Every new account gets one free Recruiter Check, so you can see your Interview Score and recruiter style feedback before deciding whether you need more.',
  },
  {
    question: 'Can I cancel anytime?',
    answer: 'Yes. Plans renew weekly and can be cancelled at any time from your account billing page — you keep access until the end of the current period.',
  },
  {
    question: 'What happens to my uploaded CV?',
    answer: 'Uploads are deleted within 24 hours of being processed. See our Privacy Policy for full details on data retention.',
  },
  {
    question: 'What if I am not happy after paying?',
    answer: 'If you are not satisfied with your first paid check, you can request a full refund within 7 days by emailing support@recruitercheck.app.',
  },
]

export function PricingPage() {
  usePageMeta({
    title: 'Pricing | MyRecruiterCheck',
    description: 'Simple, transparent pricing for Recruiter Checks. Your first check is free — plans from €10 per week for ongoing feedback on every application.',
    path: '/pricing',
  })

  const { user, profile } = useAuth()
  const { open } = useAuthModal()
  const navigate = useNavigate()

  function handlePlanCta() {
    if (user) {
      navigate('/account/billing')
    } else {
      open('sign-up')
    }
  }

  return (
    <main>
      <section className="border-b border-border-soft bg-surface py-12 sm:py-16 lg:py-20">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue">Pricing</p>
            <h1 className="font-display mt-4 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl lg:text-[44px]">
              Simple pricing for every job search
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-text-secondary">
              Your first Recruiter Check is free. Choose a plan when you're ready for ongoing feedback on every application.
            </p>
          </div>
        </Container>
      </section>

      <section className="py-10 sm:py-14">
        <Container>
          <div className="mx-auto max-w-5xl">
            <PricingCards
              plans={PRICING_PLANS.filter((plan) => plan.id !== 'free')}
              currentTier={profile?.subscription_tier ?? ''}
              loadingPlan={null}
              managingBilling={false}
              onUpgrade={handlePlanCta}
              onDowngrade={handlePlanCta}
              onManageBilling={() => navigate('/account/billing')}
            />
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
