import { Link, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/utils/cn'

interface BackLinkProps {
  /** A fixed destination. Omit to instead go back to wherever the user came from. */
  to?: string
  /**
   * Where history-back should land when there is no in-app history to go
   * back to — a visitor arriving straight from a search result has none, and
   * navigate(-1) would either do nothing or throw them off the site.
   */
  fallbackTo?: string
  label?: string
  className?: string
}

const linkClassName =
  'inline-flex min-h-[44px] items-center gap-1.5 rounded-lg py-1 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary touch-manipulation sm:min-h-0'

const icon = (
  <svg viewBox="0 0 20 20" fill="none" className="h-[16px] w-[16px]" aria-hidden="true">
    <path
      d="M12.5 15.5L7 10l5.5-5.5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export function BackLink({ to, fallbackTo = '/', label = 'Back', className }: BackLinkProps) {
  const navigate = useNavigate()
  const location = useLocation()

  if (!to) {
    // React Router stamps key 'default' on the first entry of a fresh
    // history stack, which is exactly the case where there is nothing to go
    // back to within the app.
    const hasHistory = location.key !== 'default'
    return (
      <button
        type="button"
        onClick={() => (hasHistory ? navigate(-1) : navigate(fallbackTo))}
        className={cn(linkClassName, className)}
      >
        {icon}
        {label}
      </button>
    )
  }

  return (
    <Link to={to} className={cn(linkClassName, className)}>
      {icon}
      {label}
    </Link>
  )
}
