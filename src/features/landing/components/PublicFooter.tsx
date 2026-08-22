import { Link } from 'react-router-dom'
import { Container } from '@/components/ui/Container'
import { BRAND } from '@/lib/constants'

const linkClassName =
  'text-text-secondary transition-colors duration-150 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue rounded'

const headingClassName = 'text-xs font-semibold uppercase tracking-wide text-text-primary'

const socialLinkClassName =
  'flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-colors duration-150 hover:bg-background hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue'

const socialLinks = [
  {
    href: 'https://www.linkedin.com/company/myrecruitercheck/',
    label: 'MyRecruiterCheck on LinkedIn',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M3.5 5.5A1.5 1.5 0 1 0 3.5 2.5a1.5 1.5 0 0 0 0 3ZM2.25 6.75h2.5v7h-2.5v-7ZM6.75 6.75h2.4v.96h.03c.33-.63 1.15-1.29 2.37-1.29 2.54 0 3 1.67 3 3.84v3.49h-2.5v-3.1c0-.74-.01-1.69-1.03-1.69-1.03 0-1.19.8-1.19 1.63v3.16h-2.5v-7Z" />
      </svg>
    ),
  },
  {
    href: 'https://www.instagram.com/myrecruitercheck/',
    label: 'MyRecruiterCheck on Instagram',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
        <rect x="1.5" y="1.5" width="13" height="13" rx="3.5" />
        <circle cx="8" cy="8" r="3.2" />
        <circle cx="11.6" cy="4.4" r="0.6" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
] as const

interface FooterColumn {
  heading: string
  ariaLabel: string
  links: { to: string; label: string }[]
}

const columns: FooterColumn[] = [
  {
    heading: 'Resume Checkers',
    ariaLabel: 'Resume checks by job title',
    links: [
      { to: '/software-engineer-resume-checker', label: 'Software Engineer' },
      { to: '/registered-nurse-resume-checker', label: 'Registered Nurse' },
      { to: '/project-manager-resume-checker', label: 'Project Manager' },
      { to: '/sales-resume-checker', label: 'Sales' },
      { to: '/administrative-assistant-resume-checker', label: 'Administrative Assistant' },
    ],
  },
  {
    heading: 'Tools',
    ariaLabel: 'Site tools',
    links: [
      { to: '/application-checker', label: 'Application Checker' },
      { to: '/free-cv-checker', label: 'Free CV Checker' },
      { to: '/ats-resume-checker', label: 'ATS Checker' },
      { to: '/resume-job-description-match', label: 'CV Job Match' },
      { to: '/interview-probability-score', label: 'Interview Score' },
      { to: '/how-recruiters-evaluate-a-cv', label: 'How Recruiters Evaluate a CV' },
    ],
  },
  {
    heading: 'Compare',
    ariaLabel: 'Comparisons',
    links: [
      { to: '/myrecruitercheck-vs-jobscan', label: 'vs Jobscan' },
      { to: '/myrecruitercheck-vs-resume-worded', label: 'vs Resume Worded' },
      { to: '/myrecruitercheck-vs-teal', label: 'vs Teal' },
      { to: '/myrecruitercheck-vs-rezi', label: 'vs Rezi' },
      { to: '/myrecruitercheck-vs-kickresume', label: 'vs Kickresume' },
    ],
  },
  {
    heading: 'Company',
    ariaLabel: 'Company and legal',
    links: [
      { to: '/about', label: 'About' },
      { to: '/pricing', label: 'Pricing' },
      { to: '/faq', label: 'FAQ' },
      { to: '/terms', label: 'Terms of Service' },
      { to: '/privacy', label: 'Privacy Policy' },
      { to: '/cookies', label: 'Cookie Policy' },
      { to: '/disclaimer', label: 'Disclaimer' },
    ],
  },
]

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <Container>
        <div className="py-8 lg:py-[48px]">
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
            {columns.map((column) => (
              <nav key={column.heading} aria-label={column.ariaLabel}>
                <h3 className={headingClassName}>{column.heading}</h3>
                <ul className="mt-3 flex flex-col gap-2">
                  {column.links.map((link) => (
                    <li key={link.to} className="text-xs">
                      <Link to={link.to} className={linkClassName}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
          <div className="mt-8 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="text-xs text-text-secondary">
              <p>
                © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
              </p>
              <p className="mt-0.5 text-text-secondary">{BRAND.tagline}</p>
            </div>
            <nav aria-label="Social profiles" className="flex items-center gap-2">
              {socialLinks.map((social) => (
                <a
                  key={social.href}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  className={socialLinkClassName}
                >
                  {social.icon}
                </a>
              ))}
            </nav>
          </div>
        </div>
      </Container>
    </footer>
  )
}
