import { Link, useLocation } from 'react-router-dom'
import { Container } from '@/components/ui/Container'
import { cn } from '@/utils/cn'

const navItems = [
  { to: '/checks', label: 'My Checks' },
  { to: '/account', label: 'Account' },
] as const

export function AppHeader() {
  const location = useLocation()

  return (
    <header className="border-b border-border bg-surface">
      <Container>
        <div className="flex h-16 items-center gap-8">
          {/* Intentionally not a link: navigation inside the app happens
              through My Checks / Account, not the logo. */}
          <span className="inline-flex items-center gap-2.5 text-text-primary">
            <span className="text-xl font-extrabold tracking-tight text-navy">RecruiterCheck</span>
          </span>
          <nav className="hidden items-center gap-1 sm:flex" aria-label="App">
            {navItems.map((item) => {
              const isActive = location.pathname.startsWith(item.to)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-background font-medium text-text-primary'
                      : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </Container>
    </header>
  )
}
