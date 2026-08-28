import { Plus } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { Container } from '@/components/ui/Container'
import { cn } from '@/utils/cn'

const navItems = [
  { to: '/checks', label: 'My Checks' },
  { to: '/account', label: 'Account' },
] as const

function isNavItemActive(pathname: string, to: string): boolean {
  if (to === '/checks') {
    return (
      !isNewCheckActive(pathname) && (pathname === '/checks' || /^\/checks\/[^/]+$/.test(pathname))
    )
  }
  return pathname.startsWith(to)
}

function isNewCheckActive(pathname: string): boolean {
  return pathname === '/checks/new' || /^\/checks\/[^/]+\/edit$/.test(pathname)
}

export function AppHeader() {
  const location = useLocation()

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background pt-[env(safe-area-inset-top)] sm:static lg:h-[72px] lg:border-b-border-soft">
      <Container className="lg:max-w-[1120px]">
        <div className="flex h-14 items-center gap-8 sm:h-16 lg:h-[72px]">
          {/* Intentionally not a link: navigation inside the app happens
              through My Checks / Account, not the logo. */}
          <span className="inline-flex items-center gap-2.5 text-text-primary">
            <span className="text-[18px] font-extrabold tracking-tight text-navy sm:text-xl">
              MyRecruiter<span className="text-blue">Check</span>
            </span>
          </span>
          <nav className="hidden items-center gap-1 sm:flex" aria-label="App">
            {navItems.map((item) => {
              const isActive = isNavItemActive(location.pathname, item.to)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'rounded-lg px-3.5 py-2 text-sm transition-colors duration-150',
                    isActive
                      ? 'bg-navy-tint font-medium text-navy'
                      : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
            <Link
              to="/checks/new"
              aria-current={isNewCheckActive(location.pathname) ? 'page' : undefined}
              className={cn(
                'ml-2 inline-flex items-center gap-1 rounded-lg bg-navy px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-navy/90',
                isNewCheckActive(location.pathname) && 'ring-2 ring-navy/30 ring-offset-2',
              )}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              New Check
            </Link>
          </nav>
        </div>
      </Container>
    </header>
  )
}
