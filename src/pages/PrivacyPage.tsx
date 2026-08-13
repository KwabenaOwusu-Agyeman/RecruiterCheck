import { Link } from 'react-router-dom'
import { LegalLayout, Section } from '@/components/legal/LegalLayout'
import { usePageMeta } from '@/hooks/usePageMeta'

export function PrivacyPage() {
  usePageMeta({
    title: 'Privacy Policy — MyRecruiterCheck',
    description: 'How MyRecruiterCheck collects, uses, and protects your data.',
    path: '/privacy',
  })

  return (
    <LegalLayout title="Privacy Policy" updated="7 August 2026">
      <Section title="1. Who We Are">
        <p>
          MyRecruiterCheck ("we", "us") operates from the Netherlands and is the data controller for
          the personal data described in this Privacy Policy, in accordance with the EU General
          Data Protection Regulation (GDPR).
        </p>
      </Section>

      <Section title="2. What Data We Collect">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Account data:</strong> email address, full name, authentication data.</li>
          <li><strong>Newsletter data:</strong> email address, consent wording and consent date when you choose to subscribe.</li>
          <li><strong>Product feedback:</strong> ratings and comments you voluntarily provide after a Recruiter Check, plus your first name and target job title when you permit us to feature a review.</li>
          <li><strong>Content you submit:</strong> your CV, job descriptions, and any generated feedback and documents.</li>
          <li><strong>Payment data:</strong> handled directly by Stripe. We do not receive or store your card details.</li>
          <li><strong>Usage data:</strong> log data, device and browser information, and cookies necessary to operate the Service.</li>
        </ul>
      </Section>

      <Section title="3. How We Use Your Data">
        <p>We process your data to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Provide the Service, including generating your interview probability score, feedback, and tailored documents;</li>
          <li>Process payments and manage your subscription;</li>
          <li>Maintain the security and integrity of the Service;</li>
          <li>Use voluntary product feedback to improve the Service. We will not publish your comment without your permission;</li>
          <li>Communicate with you about your account or the Service.</li>
        </ul>
        <p>
          Our legal basis for this processing is the performance of our contract with you (our
          Terms of Service), and our legitimate interest in operating and securing the Service.
        </p>
      </Section>

      <Section title="4. AI Processing">
        <p>
          To generate your feedback, score, and documents, your CV and job description are sent to
          our AI provider for processing. This data is used solely to generate your results and is
          not used by us to train models.
        </p>
      </Section>

      <Section title="5. Who We Share Data With">
        <p>We share data with the following processors, only as needed to run the Service:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Supabase:</strong> database, authentication, and file storage hosting;</li>
          <li><strong>Our AI provider:</strong> generating feedback, scores, and tailored documents;</li>
          <li><strong>Stripe:</strong> payment processing and subscription billing.</li>
        </ul>
        <p>We do not sell your personal data to third parties.</p>
      </Section>

      <Section title="6. International Transfers">
        <p>
          Some of our processors may process data outside the European Economic Area. Where this
          occurs, we rely on appropriate safeguards, such as Standard Contractual Clauses, to
          protect your data.
        </p>
      </Section>

      <Section title="7. Data Retention">
        <p>
          We retain your data for as long as your account is active. You can permanently delete
          your account, CV, and all generated documents at any time from{' '}
          <Link to="/account" className="font-medium text-blue hover:underline">
            Account settings
          </Link>
          . This immediately and permanently removes your data from our systems, except where we
          are required to retain limited records (e.g. billing history) for legal or accounting
          purposes.
        </p>
      </Section>

      <Section title="8. Your Rights">
        <p>Under the GDPR, you have the right to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Access the personal data we hold about you;</li>
          <li>Correct inaccurate data;</li>
          <li>Erase your data (see Account settings for self service deletion);</li>
          <li>Restrict or object to certain processing;</li>
          <li>Receive your data in a portable format;</li>
          <li>Lodge a complaint with the Dutch Data Protection Authority (Autoriteit Persoonsgegevens) or your local supervisory authority.</li>
        </ul>
        <p>
          To exercise any of these rights, contact us at{' '}
          <a href="mailto:privacy@recruitercheck.app" className="font-medium text-blue hover:underline">
            privacy@recruitercheck.app
          </a>
          .
        </p>
      </Section>

      <Section title="9. Cookies">
        <p>
          We use only the cookies strictly necessary to keep you signed in and to operate the
          Service. We do not use advertising or tracking cookies.
        </p>
      </Section>

      <Section title="10. Security">
        <p>
          We use industry standard technical and organizational measures, including encryption in
          transit, to protect your data. No system is completely secure, and we cannot guarantee
          absolute security.
        </p>
      </Section>

      <Section title="11. Children's Privacy">
        <p>The Service is not directed at individuals under 16, and we do not knowingly collect data from them.</p>
      </Section>

      <Section title="12. Changes to This Policy">
        <p>
          We may update this Privacy Policy from time to time. Material changes will be reflected
          by updating the "Last updated" date above.
        </p>
      </Section>

      <Section title="13. Contact">
        <p>
          For any privacy questions, contact us at{' '}
          <a href="mailto:privacy@recruitercheck.app" className="font-medium text-blue hover:underline">
            privacy@recruitercheck.app
          </a>
          .
        </p>
      </Section>

      <Section title="14. Browser Extension">
        <p>
          The MyRecruiterCheck browser extension reads the job posting on the page you are currently
          viewing only when you explicitly click "Capture this job." It never runs in the background
          and never scans pages you have not asked it to read.
        </p>
        <p>The extension captures, at most:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>The job title, company name, and job description text visible on the page;</li>
          <li>The URL of the page you captured the job from.</li>
        </ul>
        <p>The extension never collects:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your browsing history, cookies, passwords, or clipboard;</li>
          <li>Your LinkedIn profile, connections, messages, or any social/networking data;</li>
          <li>Any content from pages other than the one you explicitly capture.</li>
        </ul>
        <p>
          The extension maintains its own sign-in, separate from your browser session on this
          website — connecting it does not give it access to your password. A captured job is
          stored temporarily (for up to 48 hours, or until you use it to start a Recruiter Check,
          whichever is sooner) and is then permanently deleted.
        </p>
      </Section>
    </LegalLayout>
  )
}
