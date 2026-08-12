import { Link, useLocation } from 'react-router-dom'
import { Container } from '@/components/ui/Container'
import { cn } from '@/utils/cn'
import { BRAND } from '@/lib/constants'

const navItems = [
  { to: '/checks', label: 'My Checks' },
  { to: '/checks/new', label: 'New Check' },
  { to: '/account', label: 'Account' },
] as const

function isNavItemActive(pathname: string, to: string): boolean {
  if (to === '/checks/new') {
    return pathname === '/checks/new' || /^\/checks\/[^/]+\/edit$/.test(pathname)
  }
  if (to === '/checks') {
    return (
      !isNavItemActive(pathname, '/checks/new') &&
      (pathname === '/checks' || /^\/checks\/[^/]+$/.test(pathname))
    )
  }
  return pathname.startsWith(to)
}

export function AppHeader() {
  const location = useLocation()

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/80 pt-[env(safe-area-inset-top)] backdrop-blur-md sm:static sm:bg-surface sm:backdrop-blur-none lg:h-[72px] lg:border-b-border-soft">
      <Container className="lg:max-w-[1120px]">
        <div className="flex h-14 items-center gap-8 sm:h-16 lg:h-[72px]">
          {/* Intentionally not a link: navigation inside the app happens
              through My Checks / Account, not the logo. */}
          <span className="inline-flex items-center gap-2.5 text-text-primary">
            <span className="text-[18px] font-extrabold tracking-tight text-navy sm:text-xl">
              {BRAND.name}
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
          </nav>
        </div>
      </Container>
    </header>
  )
}
