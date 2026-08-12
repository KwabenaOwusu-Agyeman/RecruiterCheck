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
    <LegalLayout title="Privacy Policy" updated="12 August 2026">
      <Section title="1. Who We Are">
        <p>
          MyRecruiterCheck ("we", "us") is the data controller for the personal data described in
          this Privacy Policy, in accordance with the EU General Data Protection Regulation
          (GDPR). We operate from the Netherlands.
        </p>
        <p>
          For any privacy question or request, contact us at{' '}
          <a href="mailto:privacy@recruitercheck.app" className="font-medium text-blue hover:underline">
            privacy@recruitercheck.app
          </a>
          .
        </p>
      </Section>

      <Section title="2. What Data We Collect">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Account data:</strong> email address, full name, authentication data.</li>
          <li>
            <strong>Temporary uploads:</strong> the original CV file and job description text you
            submit for a Recruiter Check.
          </li>
          <li>
            <strong>Saved results:</strong> the interview probability score, category scores,
            recruiter feedback, job title, and company name generated for each check, and any
            tailored CV, cover letter, or recruiter email you generate.
          </li>
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
          <li>Communicate with you about your account or the Service.</li>
        </ul>
        <p>Our GDPR lawful bases for this processing are:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Performance of a contract</strong> (Art. 6(1)(b) GDPR) — processing your CV and
            job description to generate your score, feedback, and documents is the Service you
            asked us to provide;
          </li>
          <li>
            <strong>Legitimate interests</strong> (Art. 6(1)(f) GDPR) — securing the Service,
            preventing abuse, and maintaining minimal operational logs; and
          </li>
          <li>
            <strong>Legal obligation</strong> (Art. 6(1)(c) GDPR) — where we must retain limited
            records, such as billing history, for accounting or tax law.
          </li>
        </ul>
      </Section>

      <Section title="4. How AI-Powered Analysis Works">
        <p>
          To generate your interview probability score, feedback, and any tailored documents, the
          relevant content of your CV and the job description is sent to our AI service provider,{' '}
          <strong>OpenAI</strong>, for processing via its API. This happens each time you run a
          Recruiter Check or generate documents.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            OpenAI acts as a data processor (subprocessor) for us and processes this content only
            to return a result to our Service — not for its own independent purposes.
          </li>
          <li>
            Under OpenAI's API terms, data submitted through the API is not used to train OpenAI's
            models unless the API customer explicitly opts in to that. MyRecruiterCheck does not,
            and will not, opt into model training or any other voluntary data-sharing program with
            OpenAI.
          </li>
          <li>
            OpenAI retains API data under its own retention policy, which is separate from, and may
            be longer than, MyRecruiterCheck's own 24-hour deletion of original uploads described
            in Section 7 below. We have not configured, and do not claim, that OpenAI deletes your
            data within 24 hours — that timeframe applies to what we ourselves store.
          </li>
        </ul>
      </Section>

      <Section title="5. Who We Share Data With">
        <p>We share data with the following subprocessors, only as needed to run the Service:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Supabase:</strong> database, authentication, and private file storage hosting;</li>
          <li><strong>Vercel:</strong> hosting and delivery of the MyRecruiterCheck web application;</li>
          <li><strong>OpenAI:</strong> AI processing to generate your feedback, scores, and tailored documents (see Section 4);</li>
          <li><strong>Stripe:</strong> payment processing and subscription billing.</li>
        </ul>
        <p>
          We do not use any third-party advertising or analytics service — see our{' '}
          <Link to="/cookies" className="font-medium text-blue hover:underline">Cookie Policy</Link>. We do not sell your personal data.
        </p>
      </Section>

      <Section title="6. International Data Transfers">
        <p>
          Our subprocessors may process data outside the European Economic Area (for example,
          OpenAI and Stripe operate infrastructure in the United States). Where this occurs, we
          rely on appropriate safeguards recognized under GDPR, such as the European Commission's
          Standard Contractual Clauses or an equivalent adequacy mechanism offered by the
          subprocessor, to protect your data.
        </p>
      </Section>

      <Section title="7. Data Retention">
        <p>We apply different retention periods depending on the type of data:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Original uploads</strong> — the CV file you upload and the job description text
            you submit — are automatically and permanently deleted from our systems within 24
            hours of upload. This applies whether the check completes, fails, or is abandoned
            before you finish it. Deletion is performed by an automated server-side process, not
            something you need to trigger.
          </li>
          <li>
            <strong>Saved results</strong> — your interview probability score, category scores,
            recruiter feedback, job title, company name, and any generated documents — are kept in
            your "My Checks" list until you delete that specific check or delete your account. They
            are not subject to the 24-hour deletion above.
          </li>
          <li>
            <strong>Account data</strong> is kept for as long as your account is active.
          </li>
        </ul>
        <p>
          You can delete an individual check at any time from{' '}
          <Link to="/checks" className="font-medium text-blue hover:underline">My Checks</Link>, or
          permanently delete your account, all saved checks, uploaded CVs, and generated documents
          at any time from{' '}
          <Link to="/account" className="font-medium text-blue hover:underline">
            Account settings
          </Link>
          . Both actions ask you to confirm first, because they cannot be undone. Deleting your
          account removes your saved data except information we are required to retain for legal
          or accounting purposes (e.g. billing records).
        </p>
      </Section>

      <Section title="8. Your GDPR Rights">
        <p>Under the GDPR, you have the right to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Access</strong> the personal data we hold about you;</li>
          <li><strong>Correct</strong> inaccurate or incomplete data;</li>
          <li><strong>Erase</strong> your data (see Section 7 for self-service deletion of checks and your account);</li>
          <li><strong>Restrict</strong> or <strong>object</strong> to certain processing;</li>
          <li><strong>Receive</strong> your data in a structured, portable format;</li>
          <li>Lodge a complaint with a supervisory authority.</li>
        </ul>
        <p>
          To exercise any of these rights, contact us at{' '}
          <a href="mailto:privacy@recruitercheck.app" className="font-medium text-blue hover:underline">
            privacy@recruitercheck.app
          </a>
          . We will respond within the timeframes required by the GDPR. If you are not satisfied
          with our response, you have the right to lodge a complaint with the Dutch Data Protection
          Authority (Autoriteit Persoonsgegevens) or the supervisory authority in your own EU
          member state.
        </p>
      </Section>

      <Section title="9. Cookies and Analytics">
        <p>
          We use only cookies/local storage strictly necessary to keep you signed in, and a
          first-party product-analytics record that is not cookie-based. We do not use advertising
          or third-party tracking cookies. See our{' '}
          <Link to="/cookies" className="font-medium text-blue hover:underline">Cookie Policy</Link>{' '}
          for full details.
        </p>
      </Section>

      <Section title="10. Security">
        <p>
          We use industry standard technical and organizational measures to protect your data,
          including encryption in transit, private (non-public) file storage, database access
          controls scoped to each individual account, and short-lived signed links for any
          generated document you download. No system is completely secure, and we cannot guarantee
          absolute security.
        </p>
      </Section>

      <Section title="11. Children's Privacy">
        <p>The Service is not directed at individuals under 16, and we do not knowingly collect data from them.</p>
      </Section>

      <Section title="12. Legal Disclosures">
        <p>
          We may disclose personal data where required to comply with a legal obligation, court
          order, or lawful request from a public authority, or to protect the rights, property, or
          safety of MyRecruiterCheck, our users, or others.
        </p>
      </Section>

      <Section title="13. Changes to This Policy">
        <p>
          We may update this Privacy Policy from time to time. Material changes will be reflected
          by updating the "Last updated" date above.
        </p>
      </Section>

      <Section title="14. Contact">
        <p>
          For any privacy questions, contact us at{' '}
          <a href="mailto:privacy@recruitercheck.app" className="font-medium text-blue hover:underline">
            privacy@recruitercheck.app
          </a>
          .
        </p>
      </Section>

      <Section title="15. Browser Extension">
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
          whichever is sooner) and is then automatically and permanently deleted by the same
          server-side scheduled process described in Section 7.
        </p>
      </Section>
    </LegalLayout>
  )
}
