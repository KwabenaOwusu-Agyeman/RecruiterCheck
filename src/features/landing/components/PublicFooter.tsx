import { Link } from 'react-router-dom'
import { Container } from '@/components/ui/Container'
import { BRAND } from '@/lib/constants'

const linkClassName =
  'rounded transition-colors duration-150 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue'

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <Container>
        <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between lg:py-[32px]">
          <div>
            <p className="text-xs text-text-secondary">
              © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
            </p>
            <p className="mt-0.5 text-xs text-text-secondary/80">
              See your application from a recruiter&rsquo;s perspective.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-secondary" aria-label="Legal">
            <Link to="/faq" className={linkClassName}>
              FAQ
            </Link>
            <Link to="/terms" className={linkClassName}>
              Terms of Service
            </Link>
            <Link to="/privacy" className={linkClassName}>
              Privacy Policy
            </Link>
            <Link to="/disclaimer" className={linkClassName}>
              Disclaimer
            </Link>
          </nav>
        </div>
      </Container>
    </footer>
  )
}
