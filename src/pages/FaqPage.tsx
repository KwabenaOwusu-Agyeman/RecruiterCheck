import { Link } from 'react-router-dom'
import { LegalLayout, Section } from '@/components/legal/LegalLayout'
import { usePageMeta } from '@/hooks/usePageMeta'

const FAQ_ITEMS = [
  {
    question: 'How does MyRecruiterCheck evaluate my application?',
    answer:
      "MyRecruiterCheck compares your CV against the specific job description you provide and evaluates the match the way a recruiter would. You get an Interview Probability, along with Strengths, Areas to Improve, and Prospects based only on what's in your CV and the job posting. Interview Probability is an estimate based on how strongly your CV matches the job requirements. It is not a guarantee of an interview.",
  },
  {
    question: 'Does MyRecruiterCheck guarantee an interview?',
    answer:
      'No. MyRecruiterCheck does not guarantee an interview, a job offer, or employment. It gives you an honest, recruiter-style read on your application so you can decide how to strengthen it before you apply.',
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
      'The core of every check is your Interview Probability, Strengths, Areas to Improve, and Prospects. If you upgrade, you can also generate a Recruiter Ready Kit — a tailored CV, cover letter, and recruiter message built from your existing information.',
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
    <LegalLayout title="Frequently Asked Questions" updated="12 August 2026">
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
