import { Link } from 'react-router-dom'
import { LegalLayout, Section } from '@/components/legal/LegalLayout'
import { usePageMeta } from '@/hooks/usePageMeta'
import { BRAND } from '@/lib/constants'

export function AboutPage() {
  usePageMeta({
    title: 'About MyRecruiterCheck',
    description:
      'MyRecruiterCheck is a recruiter style CV and job description match checker for early career AI, data and technology candidates. What it is, who it is for, pricing and privacy.',
    path: '/about',
  })

  return (
    // standalone={false}: /about is the one LegalLayout page routed inside
    // PublicLayout, which already supplies the skip link, header, back link and
    // main landmark. Rendering them again gave this page two of each.
    <LegalLayout title="About MyRecruiterCheck" updated="22 September 2026" standalone={false}>
      <Section title="What MyRecruiterCheck is">
        <p>
          MyRecruiterCheck is a recruiter style CV and job description match checker for early
          career AI, data and technology candidates. It evaluates a candidate's evidence, skills
          and experience against a specific job description and provides a recruiter style
          assessment before they apply.
        </p>
      </Section>

      <Section title="What MyRecruiterCheck does">
        <p>
          MyRecruiterCheck compares your CV with a specific job description and gives you
          recruiter style feedback on your experience, skills and candidate value. It goes beyond
          basic ATS keyword matching by asking whether your application gives a recruiter a
          credible reason to interview you, not only whether your CV contains the right words.
          Each check returns an Interview Score, Strengths, Areas to Improve and Prospects.{' '}
          <Link to="/how-interview-score-works" className="font-medium text-blue hover:underline">
            How the Interview Score works
          </Link>{' '}
          sets out the method, and{' '}
          <Link to="/how-recruiters-evaluate-a-cv" className="font-medium text-blue hover:underline">
            how recruiters evaluate a CV
          </Link>{' '}
          explains the thinking behind it.
        </p>
      </Section>

      <Section title="Who it is for">
        <p>
          MyRecruiterCheck is built for candidates with 0 to 5 years of experience applying for
          AI, machine learning, data and software roles, including career changers and people
          whose evidence comes from internships, coursework or personal projects. It suits anyone
          who wants to understand how their application may look to a recruiter before they
          submit it, including people who are passing ATS checks but not getting interviews.
          There are role specific pages for the{' '}
          <Link to="/ai-engineer-cv-checker" className="font-medium text-blue hover:underline">
            AI engineer
          </Link>
          ,{' '}
          <Link
            to="/machine-learning-engineer-cv-checker"
            className="font-medium text-blue hover:underline"
          >
            machine learning engineer
          </Link>
          ,{' '}
          <Link to="/data-analyst-cv-checker" className="font-medium text-blue hover:underline">
            data analyst
          </Link>
          ,{' '}
          <Link to="/data-scientist-cv-checker" className="font-medium text-blue hover:underline">
            data scientist
          </Link>{' '}
          and{' '}
          <Link
            to="/software-engineer-resume-checker"
            className="font-medium text-blue hover:underline"
          >
            software engineer
          </Link>{' '}
          roles.
        </p>
      </Section>

      <Section title="Who it is not for">
        <p>
          MyRecruiterCheck checks one CV against one job description at a time. It does not build
          a CV from scratch, track applications across a job search, or simulate any specific
          employer's applicant tracking system, and it cannot guarantee an interview or a hiring
          decision.
        </p>
      </Section>

      <Section title="Pricing">
        <p>
          Your first Recruiter Check is free, with no card required, and it does not expire. After
          that, checks come in one time packs with no subscription: Starter is 5 checks for €10,
          Active is 15 checks for €20 and Power is 40 checks for €40. Purchased checks are valid
          for 90 days. See{' '}
          <Link to="/pricing" className="font-medium text-blue hover:underline">
            Pricing
          </Link>{' '}
          for what each pack includes.
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
        <p>
          If your result is Needs Improvement, you may be offered one optional follow up
          question about the single most important evidence gap. Your answer is self reported
          and unverified, and it can only raise your score or leave it unchanged, never lower
          it.{' '}
          <Link to="/how-interview-score-works" className="font-medium text-blue hover:underline">
            How the Interview Score works
          </Link>{' '}
          explains this in full.
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

      <Section title="Elsewhere online">
        <p>
          MyRecruiterCheck is also on{' '}
          <a
            href="https://www.linkedin.com/company/myrecruitercheck/"
            rel="noopener noreferrer"
            className="font-medium text-blue hover:underline"
          >
            LinkedIn
          </a>
          ,{' '}
          <a
            href="https://www.instagram.com/myrecruitercheck/"
            rel="noopener noreferrer"
            className="font-medium text-blue hover:underline"
          >
            Instagram
          </a>{' '}
          and{' '}
          <a
            href="https://www.trustpilot.com/review/myrecruitercheck.com"
            rel="noopener noreferrer"
            className="font-medium text-blue hover:underline"
          >
            Trustpilot
          </a>
          .
        </p>
      </Section>

      {/* Page level entities for /about. The sitewide Organization, WebSite and
          SoftwareApplication blocks live in index.html and carry stable @id
          values; these two reference those nodes rather than restating them, so
          the page joins the existing graph instead of creating a second, rival
          copy of the organisation. dateModified mirrors the "Last updated" date
          rendered above it. scripts/prerender.mjs reconciles the CSP hashes. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'AboutPage',
            '@id': `${BRAND.canonicalUrl}/about#webpage`,
            url: `${BRAND.canonicalUrl}/about`,
            name: 'About MyRecruiterCheck',
            dateModified: '2026-09-22',
            isPartOf: { '@id': `${BRAND.canonicalUrl}/#website` },
            mainEntity: { '@id': `${BRAND.canonicalUrl}/#organization` },
          }),
        }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: BRAND.canonicalUrl },
              { '@type': 'ListItem', position: 2, name: 'About', item: `${BRAND.canonicalUrl}/about` },
            ],
          }),
        }}
      />
    </LegalLayout>
  )
}
