import { Link } from 'react-router-dom'
import { Container } from '@/components/ui/Container'

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <Container>
        <div className="flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-text-secondary">
            © {new Date().getFullYear()} RecruiterCheck. All rights reserved.
          </p>
          <nav className="flex gap-4 text-xs text-text-secondary" aria-label="Legal">
            <Link to="/terms" className="transition-colors hover:text-text-primary">
              Terms of Service
            </Link>
            <Link to="/privacy" className="transition-colors hover:text-text-primary">
              Privacy Policy
            </Link>
            <Link to="/disclaimer" className="transition-colors hover:text-text-primary">
              Disclaimer
            </Link>
          </nav>
        </div>
      </Container>
    </footer>
  )
}
