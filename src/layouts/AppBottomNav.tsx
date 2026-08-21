import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/utils/cn'

function ChecksIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1.45.9L12 18.5l-4.55 2.4A1 1 0 0 1 6 20V4a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9 8h6M9 11.5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function AccountIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.25" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5 20c1.1-3.4 4-5.2 7-5.2s5.9 1.8 7 5.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  )
}

export function AppBottomNav() {
  const { pathname } = useLocation()

  // "New Check" owns /checks/new and the draft-edit form (same page
  // component); "Checks" owns the list and a single check's feedback view,
  // but must not also light up for /checks/new since it's a startsWith prefix.
  const isNewCheckActive = pathname === '/checks/new' || /^\/checks\/[^/]+\/edit$/.test(pathname)
  const isChecksActive =
    !isNewCheckActive && (pathname === '/checks' || /^\/checks\/[^/]+$/.test(pathname))
  const isAccountActive = pathname.startsWith('/account')

  return (
    <nav
      aria-label="App"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/80 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(2,12,56,0.06)] backdrop-blur-md sm:hidden"
    >
      <div className="flex h-16 items-stretch justify-around">
        <Link
          to="/checks"
          aria-label="Checks"
          aria-current={isChecksActive ? 'page' : undefined}
          className={cn(
            'flex min-h-[44px] min-w-[64px] flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 transition-colors',
            isChecksActive ? 'text-navy' : 'text-text-secondary',
          )}
        >
          <ChecksIcon />
          <span className="text-[11px] font-medium">Checks</span>
        </Link>

        <Link
          to="/checks/new"
          aria-label="New Check"
          aria-current={isNewCheckActive ? 'page' : undefined}
          className="flex min-h-[44px] min-w-[64px] flex-1 touch-manipulation flex-col items-center justify-center gap-0.5"
        >
          <span
            className={cn(
              '-mt-5 flex h-11 w-11 items-center justify-center rounded-full bg-navy text-white shadow-hover ring-4 ring-surface transition-transform',
              isNewCheckActive && 'scale-105',
            )}
          >
            <PlusIcon />
          </span>
          <span
            className={cn(
              'text-[11px] font-medium',
              isNewCheckActive ? 'text-navy' : 'text-text-secondary',
            )}
          >
            New Check
          </span>
        </Link>

        <Link
          to="/account"
          aria-label="Account"
          aria-current={isAccountActive ? 'page' : undefined}
          className={cn(
            'flex min-h-[44px] min-w-[64px] flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 transition-colors',
            isAccountActive ? 'text-navy' : 'text-text-secondary',
          )}
        >
          <AccountIcon />
          <span className="text-[11px] font-medium">Account</span>
        </Link>
      </div>
    </nav>
  )
}
