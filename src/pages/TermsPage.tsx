import { Link } from 'react-router-dom'
import { LegalLayout, Section } from '@/components/legal/LegalLayout'
import { usePageMeta } from '@/hooks/usePageMeta'

export function TermsPage() {
  usePageMeta({
    title: 'Terms of Service — MyRecruiterCheck',
    description: 'The terms that govern your use of MyRecruiterCheck.',
    path: '/terms',
  })

  return (
    <LegalLayout title="Terms of Service" updated="12 August 2026">
      <Section title="1. Introduction">
        <p>
          These Terms of Service ("Terms") govern your access to and use of MyRecruiterCheck (the
          "Service"), operated from the Netherlands. By creating an account or using the Service,
          you agree to these Terms. If you do not agree, do not use the Service.
        </p>
      </Section>

      <Section title="2. The Service">
        <p>
          MyRecruiterCheck lets you upload a CV and a job description to receive AI generated
          feedback, an interview score, and, on paid plans, an improved CV draft, cover
          letter, and email for a recruiter. Outputs are generated automatically by an AI model and
          are provided for informational purposes only.
        </p>
      </Section>

      <Section title="3. Eligibility">
        <p>
          You must be at least 16 years old to use the Service. By creating an account, you confirm
          that you meet this requirement and that any information you provide is accurate.
        </p>
      </Section>

      <Section title="4. User Responsibilities">
        <p>
          You are responsible for keeping your login credentials secure and for all activity that
          occurs under your account. You are responsible for the accuracy of any CV content,
          personal information, or claims you submit or that appear in documents you download and
          send to a third party — the Service does not verify facts about you.
        </p>
      </Section>

      <Section title="5. Uploaded Content Rights">
        <p>
          You retain ownership of the CV, job descriptions, and other content you submit ("Your
          Content"). You confirm you have the right to submit Your Content and that it does not
          infringe another person's rights. You grant MyRecruiterCheck a limited license to process
          Your Content, including sending relevant parts of it to our AI provider, solely to
          operate the Service for you. See our{' '}
          <Link to="/privacy" className="font-medium text-blue hover:underline">Privacy Policy</Link> for
          details on how your data is handled and deleted.
        </p>
      </Section>

      <Section title="6. Prohibited Use">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Upload content you do not have the right to share, or that infringes another person's rights;</li>
          <li>Upload content on behalf of, or impersonating, someone else without their consent;</li>
          <li>Use the Service to build a competing product, or to scrape or reverse engineer it;</li>
          <li>Attempt to disrupt, overload, probe, or gain unauthorized access to the Service or another user's data;</li>
          <li>Use the Service for any unlawful purpose.</li>
        </ul>
      </Section>

      <Section title="7. AI-Generated Content Limitations">
        <p>
          Feedback, scores, and any generated CV, cover letter, or recruiter message are produced
          automatically by an AI model and may contain errors, omissions, or inaccuracies. You must
          review and verify all claims, wording, and recommendations in any AI-generated document
          before relying on it, submitting it to an employer, or otherwise acting on it.
          MyRecruiterCheck is not responsible for the accuracy of AI-generated output or for
          decisions made based on it.
        </p>
        <p>
          <strong>
            MyRecruiterCheck does not guarantee interviews, job offers, employment, or any
            particular recruiter or employer decision.
          </strong>{' '}
          The interview score and feedback are an estimate to help you improve your
          application, not a prediction any specific employer will act on.
        </p>
      </Section>

      <Section title="8. Subscriptions, Fees & Payment">
        <p>
          Paid plans are billed in advance on a recurring basis (weekly or monthly, as selected at
          checkout) via our payment processor, Stripe. Subscriptions renew automatically at the
          end of each billing period until cancelled. Prices are shown in EUR and may include
          applicable taxes.
        </p>
        <p>
          If you are not satisfied with your first paid check, you may request a full refund
          within 7 days of that payment by contacting{' '}
          <a href="mailto:support@recruitercheck.app" className="font-medium text-blue hover:underline">
            support@recruitercheck.app
          </a>
          . Beyond this guarantee, MyRecruiterCheck does not offer refunds or credits for partial
          billing periods, unused checks, or dissatisfaction with generated results, except where
          required by mandatory law. You can cancel at any time from the billing portal to stop
          future renewals; your plan remains active until the end of the current billing period.
        </p>
      </Section>

      <Section title="9. Intellectual Property">
        <p>
          The Service, including its design, code, and branding, is owned by MyRecruiterCheck and
          protected by intellectual property laws. These Terms do not grant you any rights to our
          trademarks or branding.
        </p>
      </Section>

      <Section title="10. Third Party Services">
        <p>
          The Service relies on third party providers, including Supabase (hosting, database,
          authentication, and file storage), Vercel (application hosting), OpenAI (AI processing),
          and Stripe (payment processing). Your use of the Service is also subject to those
          providers' applicable terms.
        </p>
      </Section>

      <Section title="11. Service Availability">
        <p>
          We aim to keep the Service available and reliable but do not guarantee uninterrupted
          access. The Service may be unavailable from time to time for maintenance, updates, or
          reasons outside our control, including outages of third-party providers we depend on.
        </p>
      </Section>

      <Section title="12. Account Suspension & Termination">
        <p>
          We may suspend or terminate your access if you breach these Terms, misuse the Service, or
          where we are required to do so by law. You may cancel your subscription at any time from
          the billing portal, and you may delete your account at any time from your Account
          settings — see our{' '}
          <Link to="/privacy" className="font-medium text-blue hover:underline">Privacy Policy</Link> for
          what happens to your data when you do.
        </p>
      </Section>

      <Section title="13. Disclaimer of Warranties">
        <p>
          The Service is provided "as is" and "as available" without warranties of any kind,
          express or implied, including fitness for a particular purpose, accuracy, or
          uninterrupted availability.
        </p>
      </Section>

      <Section title="14. Limitation of Liability">
        <p>
          To the maximum extent permitted by law, MyRecruiterCheck shall not be liable for any
          indirect, incidental, or consequential damages, or for any loss of income, opportunity,
          employment outcome, or data arising from your use of the Service. Our total liability for
          any claim shall not exceed the amount you paid us in the three months preceding the
          claim.
        </p>
      </Section>

      <Section title="15. Governing Law">
        <p>
          These Terms are governed by the laws of the Netherlands, without regard to conflict of
          law principles. Any disputes shall be submitted to the competent courts of the
          Netherlands, without prejudice to any mandatory consumer protection rights you may have
          in your country of residence.
        </p>
      </Section>

      <Section title="16. Changes to These Terms">
        <p>
          We may update these Terms from time to time. Material changes will be reflected by
          updating the "Last updated" date above. Continued use of the Service after changes take
          effect constitutes acceptance of the revised Terms.
        </p>
      </Section>

      <Section title="17. Contact">
        <p>
          Questions about these Terms can be sent to{' '}
          <a href="mailto:support@recruitercheck.app" className="font-medium text-blue hover:underline">
            support@recruitercheck.app
          </a>
          .
        </p>
      </Section>
    </LegalLayout>
  )
}
