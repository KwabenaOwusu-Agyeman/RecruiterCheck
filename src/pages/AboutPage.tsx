import { Link } from 'react-router-dom'
import { LegalLayout, Section } from '@/components/legal/LegalLayout'
import { usePageMeta } from '@/hooks/usePageMeta'

export function AboutPage() {
  usePageMeta({
    title: 'About MyRecruiterCheck',
    description:
      'MyRecruiterCheck is a recruiter style CV and job application checker, operated from the Netherlands, built to give honest, evidence based feedback before you apply.',
    path: '/about',
  })

  return (
    <LegalLayout title="About MyRecruiterCheck" updated="22 August 2026">
      <Section title="What MyRecruiterCheck does">
        <p>
          MyRecruiterCheck compares your CV with a specific job description and gives you
          recruiter style feedback on your experience, skills and candidate value. It goes beyond
          basic ATS keyword matching by asking whether your application gives a recruiter a
          credible reason to interview you, not only whether your CV contains the right words.
        </p>
      </Section>

      <Section title="Who it is for">
        <p>
          MyRecruiterCheck is built for job seekers who want to understand how their application
          may look to a recruiter before they submit it, including people who are passing ATS
          checks but not getting interviews. If you already have a strong, tailored application
          for a specific role and simply want a second opinion, it can still help confirm what is
          working and what may weaken your chances.
        </p>
      </Section>

      <Section title="Our recruiter style approach">
        <p>
          Every check evaluates one CV against one specific job description, not a generic
          resume score. The feedback covers experience, required skills and overall candidate
          value, and provides an Interview Score, Strengths, Areas to Improve and Prospects. It
          is an evidence based estimate built from what is already in your CV and the job
          posting, not a guarantee of an interview or hiring decision, and not an exact simulation
          of any specific company's applicant tracking system or recruiting team.
        </p>
      </Section>

      <Section title="Honest, evidence based feedback">
        <p>
          MyRecruiterCheck never invents employers, qualifications, statistics or achievements on
          your behalf. Feedback and any generated documents are based only on the experience,
          skills and achievements already in your CV. See our{' '}
          <Link to="/faq" className="font-medium text-blue hover:underline">
            FAQ
          </Link>{' '}
          for more on what a Recruiter Check includes.
        </p>
      </Section>

      <Section title="Where we operate">
        <p>
          MyRecruiterCheck operates from the Netherlands and is the data controller for the
          personal data described in our{' '}
          <Link to="/privacy" className="font-medium text-blue hover:underline">
            Privacy Policy
          </Link>
          , in accordance with the EU General Data Protection Regulation (GDPR).
        </p>
      </Section>

      <Section title="Privacy by default">
        <p>
          Your original uploaded CV and any documents generated for you are automatically and
          permanently deleted from our storage within 24 hours of being processed. Your CV and
          job description are used only to generate your results and are never used to train
          models. You can permanently delete your account and all remaining data at any time from{' '}
          <Link to="/account" className="font-medium text-blue hover:underline">
            Account settings
          </Link>
          . Full details are in our{' '}
          <Link to="/privacy" className="font-medium text-blue hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>
    </LegalLayout>
  )
}
