import { LegalLayout, Section } from '@/components/legal/LegalLayout'
import { usePageMeta } from '@/hooks/usePageMeta'

export function DisclaimerPage() {
  usePageMeta({
    title: 'Disclaimer — RecruiterCheck',
    description: 'What RecruiterCheck does and does not claim to do.',
    path: '/disclaimer',
  })

  return (
    <LegalLayout title="Disclaimer" updated="8 August 2026">
      <Section title="A recruiter's perspective, not a guarantee">
        <p>
          RecruiterCheck reflects a recruiter&apos;s perspective of your application. It is a tool
          to help you understand and improve how your CV and application read, not a prediction or
          guarantee of an interview, job offer, or any other outcome.
        </p>
      </Section>

      <Section title="AI generated output">
        <p>
          Your interview probability score, feedback, and any generated documents (CV, cover
          letter, and email for recruiter) are produced automatically by an AI model. They may
          contain errors, omissions, or inaccuracies, and should be reviewed carefully before you
          rely on or submit them to an employer.
        </p>
      </Section>

      <Section title="Not career or legal advice">
        <p>
          Nothing on RecruiterCheck constitutes professional career counselling, recruitment, or
          legal advice. Hiring decisions are made by employers and recruiters based on many factors
          outside RecruiterCheck&apos;s knowledge or control.
        </p>
      </Section>
    </LegalLayout>
  )
}
