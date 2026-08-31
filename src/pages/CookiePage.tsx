import { Link } from 'react-router-dom'
import { LegalLayout, Section } from '@/components/legal/LegalLayout'
import { usePageMeta } from '@/hooks/usePageMeta'

export function CookiePage() {
  usePageMeta({
    title: 'Cookie Policy | MyRecruiterCheck',
    description: 'What cookies and similar technologies MyRecruiterCheck uses.',
    path: '/cookies',
  })

  return (
    <LegalLayout title="Cookie Policy" updated="29 August 2026">
      <Section title="1. Our Approach">
        <p>
          MyRecruiterCheck uses only cookies and browser storage that are strictly necessary to
          operate the Service, primarily to keep you signed in. We do not run any third-party
          advertising, marketing, or analytics script in your browser, and we do not use a
          cross-site advertising pixel.
        </p>
        <p>
          Because we only use strictly-necessary storage, and no non-essential cookies require your
          consent under applicable law (the ePrivacy Directive and GDPR), <strong>we do not show a
          cookie consent banner</strong>. If that ever changes, for example if we introduce
          optional analytics or marketing cookies, we will add a consent banner with Accept,
          Reject, and Manage Preferences options before any such cookie is set, and update this
          page accordingly.
        </p>
      </Section>

      <Section title="2. Strictly Necessary Storage We Use">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Authentication session:</strong> Supabase Auth stores your sign-in session in
            your browser's local storage so you don't have to log in on every page. Without this,
            the Service cannot function.
          </li>
          <li>
            <strong>Session redirect:</strong> a small, short-lived browser storage entry that
            remembers which page to return you to after signing in. It is deleted automatically
            once used.
          </li>
        </ul>
      </Section>

      <Section title="3. Product Analytics (Not Cookie-Based)">
        <p>
          We record a small number of first-party product events (for example, that a check was
          started or completed) directly to our own database when you use the Service. This is not
          done through a browser cookie, browser storage, a tracking pixel, or a third-party
          analytics script — no third-party analytics code runs in your browser at all. It's a
          server-side record tied to the action you took, we deliberately avoid storing raw page
          URLs in it, and it does not create or read any persistent identifier on your device. See
          our{' '}
          <Link to="/privacy" className="font-medium text-blue hover:underline">Privacy Policy</Link>{' '}
          for how this data is used.
        </p>
      </Section>

      <Section title="4. Third-Party Services">
        <p>
          We do not embed any third-party advertising, social-media, or analytics script on
          MyRecruiterCheck, so none of them can set a cookie in your browser. Links to Trustpilot
          are plain links that open Trustpilot's own site in a new tab; no Trustpilot code runs on
          our pages. Our payment processor, Stripe, may set its own cookies only if and when you
          are directed to a Stripe-hosted payment page, under Stripe's own cookie and privacy
          policies, which we do not control.
        </p>
      </Section>

      <Section title="5. Managing Cookies in Your Browser">
        <p>
          Most browsers let you block or delete cookies through their settings. Since the Service
          relies on your authentication session to keep you signed in, blocking that storage will
          sign you out and may prevent parts of the Service from working.
        </p>
      </Section>

      <Section title="6. Changes to This Policy">
        <p>
          We may update this Cookie Policy if the cookies or tracking technologies we use change.
          Material changes will be reflected by updating the "Last updated" date above.
        </p>
      </Section>

      <Section title="7. Contact">
        <p>
          Questions about this Cookie Policy can be sent to{' '}
          <a href="mailto:privacy@myrecruitercheck.com" className="font-medium text-blue hover:underline">
            privacy@myrecruitercheck.com
          </a>
          .
        </p>
      </Section>
    </LegalLayout>
  )
}
