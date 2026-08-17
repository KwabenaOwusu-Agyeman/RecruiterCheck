import { Link } from 'react-router-dom'
import { Container } from '@/components/ui/Container'
import { BRAND } from '@/lib/constants'

const linkClassName =
  'text-text-secondary transition-colors duration-150 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue rounded'

const headingClassName = 'text-xs font-semibold uppercase tracking-wide text-text-primary'

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
      { to: '/interview-probability-score', label: 'Interview Probability' },
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
          <div className="mt-8 border-t border-border pt-6 text-xs text-text-secondary">
            <p>
              © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
            </p>
            <p className="mt-0.5 text-text-secondary/80">{BRAND.tagline}</p>
          </div>
        </div>
      </Container>
    </footer>
  )
}
