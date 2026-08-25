import { Link } from 'react-router-dom'
import { LegalLayout, Section } from '@/components/legal/LegalLayout'
import { usePageMeta } from '@/hooks/usePageMeta'
import { FREE_TIER_LIFETIME_LIMIT } from '@/services/checkService'

const FAQ_ITEMS = [
  {
    question: 'How does MyRecruiterCheck evaluate my application?',
    answer:
      "MyRecruiterCheck compares your CV against the specific job description you provide and evaluates the match the way a recruiter would. You get an Interview Score, along with Strengths, Areas to Improve, and Prospects based only on what's in your CV and the job posting. Interview Score is an estimate based on how strongly your CV matches the job requirements. It is not a guarantee of an interview.",
  },
  {
    question: 'Does MyRecruiterCheck guarantee an interview?',
    answer:
      'No. MyRecruiterCheck does not guarantee an interview, a job offer, or employment. It gives you an honest, recruiter style read on your application so you can decide how to strengthen it before you apply.',
  },
  {
    question: 'Is my CV and personal information secure?',
    answer:
      'Yes. Your CV and job descriptions are used only to generate your feedback and are not used to train any models. You can permanently delete your data at any time from Account settings.',
  },
  {
    question: 'Will MyRecruiterCheck invent experience or achievements?',
    answer:
      'No. Feedback and generated documents are based only on the experience, skills, and achievements already in your CV. MyRecruiterCheck never invents employers, qualifications, statistics, or outcomes on your behalf.',
  },
  {
    question: 'What do I get with a Recruiter Check?',
    answer:
      'The core of every check is your Interview Score, Strengths, Areas to Improve, and Prospects. If you upgrade and score 61 or above, you can also generate a Recommendation, an improved CV draft, cover letter, and recruiter message built from your existing information.',
  },
  {
    question: 'What do I get on the Free plan?',
    answer: `${FREE_TIER_LIFETIME_LIMIT} Recruiter Check, including your Interview Score and Recruiter Feedback.`,
  },
  {
    question: 'What is the difference between Starter, Active, and Power?',
    answer:
      "All plans include your Interview Score and Recruiter Feedback. Active adds an improved CV draft for each check. Power adds the full Recommendation, an improved CV draft, cover letter, and recruiter message, plus access to your full check history (Starter and Active only show your most recent check). Documents are only generated for a check scored 61 or above, since a lower score means the role is not a strong match. Every plan's check allotment resets weekly with no rollover.",
  },
  {
    question: 'Can I cancel my subscription anytime?',
    answer: 'Yes. Manage or cancel your subscription anytime from the billing portal, no notice period required.',
  },
  {
    question: 'Is my payment information secure?',
    answer: 'Payments are processed securely by Stripe. We never see or store your card details.',
  },
] as const

export function FaqPage() {
  usePageMeta({
    title: 'FAQ — MyRecruiterCheck',
    description:
      'Answers to common questions about how MyRecruiterCheck evaluates your application, data security, and what you get with a Recruiter Check.',
    path: '/faq',
  })

  return (
    <LegalLayout title="Frequently Asked Questions" updated="20 August 2026">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQ_ITEMS.map(({ question, answer }) => ({
              '@type': 'Question',
              name: question,
              acceptedAnswer: { '@type': 'Answer', text: answer },
            })),
          }),
        }}
      />
      {FAQ_ITEMS.slice(0, 2).map(({ question, answer }) => (
        <Section key={question} title={question}>
          <p>{answer}</p>
        </Section>
      ))}

      <Section title="Is my CV and personal information secure?">
        <p>
          {FAQ_ITEMS[2].answer} See our{' '}
          <Link to="/privacy" className="font-medium text-blue hover:underline">
            Privacy Policy
          </Link>{' '}
          for full details.
        </p>
      </Section>

      {FAQ_ITEMS.slice(3).map(({ question, answer }) => (
        <Section key={question} title={question}>
          <p>{answer}</p>
        </Section>
      ))}
    </LegalLayout>
  )
}
