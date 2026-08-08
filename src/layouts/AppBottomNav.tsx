import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/utils/cn'

const navItems = [
  {
    to: '/checks',
    label: 'My Checks',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1.45.9L12 18.5l-4.55 2.4A1 1 0 0 1 6 20V4a1 1 0 0 1 1-1Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M9 8h6M9 11.5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/account',
    label: 'Account',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="8.5" r="3.25" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M5 20c1.1-3.4 4-5.2 7-5.2s5.9 1.8 7 5.2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
] as const

export function AppBottomNav() {
  const location = useLocation()

  return (
    <nav
      aria-label="App"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <div className="flex items-stretch justify-around">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.to)
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex min-h-[56px] min-w-[64px] flex-1 flex-col items-center justify-center gap-1 transition-colors',
                isActive ? 'text-navy' : 'text-text-secondary',
              )}
            >
              {item.icon}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
