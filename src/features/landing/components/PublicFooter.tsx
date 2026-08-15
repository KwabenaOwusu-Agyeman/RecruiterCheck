import { Link } from 'react-router-dom'
import { Container } from '@/components/ui/Container'
import { BRAND } from '@/lib/constants'

const linkClassName =
  'rounded transition-colors duration-150 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue'

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <Container>
        <div className="flex flex-col gap-3 py-4 lg:py-[32px]">
          <nav className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-secondary" aria-label="Resume checks by job title">
            <Link to="/software-engineer-resume-checker" className={linkClassName}>
              Software Engineer Resume Checker
            </Link>
            <Link to="/registered-nurse-resume-checker" className={linkClassName}>
              Registered Nurse Resume Checker
            </Link>
            <Link to="/project-manager-resume-checker" className={linkClassName}>
              Project Manager Resume Checker
            </Link>
            <Link to="/sales-resume-checker" className={linkClassName}>
              Sales Resume Checker
            </Link>
            <Link to="/administrative-assistant-resume-checker" className={linkClassName}>
              Administrative Assistant Resume Checker
            </Link>
          </nav>
          <nav className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-secondary" aria-label="Comparisons">
            <Link to="/myrecruitercheck-vs-jobscan" className={linkClassName}>
              vs Jobscan
            </Link>
            <Link to="/myrecruitercheck-vs-resume-worded" className={linkClassName}>
              vs Resume Worded
            </Link>
            <Link to="/myrecruitercheck-vs-teal" className={linkClassName}>
              vs Teal
            </Link>
            <Link to="/myrecruitercheck-vs-rezi" className={linkClassName}>
              vs Rezi
            </Link>
            <Link to="/myrecruitercheck-vs-kickresume" className={linkClassName}>
              vs Kickresume
            </Link>
          </nav>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs text-text-secondary">
                © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
              </p>
              <p className="mt-0.5 text-xs text-text-secondary/80">
                {BRAND.tagline}
              </p>
            </div>
            <nav className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-secondary" aria-label="Site links">
              <Link to="/application-checker" className={linkClassName}>
                Application Checker
              </Link>
              <Link to="/free-cv-checker" className={linkClassName}>
                Free CV Checker
              </Link>
              <Link to="/ats-resume-checker" className={linkClassName}>
                ATS Checker
              </Link>
              <Link to="/resume-job-description-match" className={linkClassName}>
                CV Job Match
              </Link>
              <Link to="/interview-probability-score" className={linkClassName}>
                Interview Probability
              </Link>
              <Link to="/faq" className={linkClassName}>
                FAQ
              </Link>
              <Link to="/terms" className={linkClassName}>
                Terms of Service
              </Link>
              <Link to="/privacy" className={linkClassName}>
                Privacy Policy
              </Link>
              <Link to="/cookies" className={linkClassName}>
                Cookie Policy
              </Link>
              <Link to="/disclaimer" className={linkClassName}>
                Disclaimer
              </Link>
            </nav>
          </div>
        </div>
      </Container>
    </footer>
  )
}
