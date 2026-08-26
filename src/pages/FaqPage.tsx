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
      'The core of every check is your Interview Score, Strengths, Areas to Improve, and Prospects. If a check is funded by a paid pack and scores 61 or above, you also get an Improved CV Draft; checks funded by a Power pack additionally get a Cover Letter and Recruiter Message. Documents are not generated below a score of 61, since a lower score means the role is not a strong match.',
  },
  {
    question: 'What do I get on the Free plan?',
    answer: `${FREE_TIER_LIFETIME_LIMIT} Recruiter Check, including your Interview Score and Recruiter Feedback.`,
  },
  {
    question: 'What is the difference between Starter, Active, and Power packs?',
    answer:
      'All three packs include your Interview Score, Recruiter Feedback, and an Improved CV Draft (for checks scoring 61 or above). Power additionally includes a Cover Letter and Recruiter Message with every check, plus access to your full check history — Starter and Active only show your most recent check.',
  },
  {
    question: 'Is there a subscription?',
    answer: 'No. There is no subscription and nothing renews automatically. You buy a pack of checks whenever you need them, and purchased checks are valid for 90 days from purchase.',
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
      <Section title={FAQ_ITEMS[0].question}>
        <p>
          {FAQ_ITEMS[0].answer} See{' '}
          <Link to="/how-interview-score-works" className="font-medium text-blue hover:underline">
            how the Interview Score works
          </Link>{' '}
          for the full breakdown.
        </p>
      </Section>

      {FAQ_ITEMS.slice(1, 2).map(({ question, answer }) => (
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
