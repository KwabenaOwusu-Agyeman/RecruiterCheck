import { Link, useNavigate } from 'react-router-dom'
import { cn } from '@/utils/cn'

interface BackLinkProps {
  /** A fixed destination. Omit to instead go back to wherever the user came from. */
  to?: string
  className?: string
}

const linkClassName =
  'text-glow-navy inline-flex min-h-[44px] items-center gap-1.5 rounded-lg py-1 text-sm font-medium text-navy transition-colors hover:text-navy/80 touch-manipulation sm:min-h-0'

const icon = (
  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
    <path
      d="M12.5 15.5L7 10l5.5-5.5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export function BackLink({ to, className }: BackLinkProps) {
  const navigate = useNavigate()

  if (!to) {
    return (
      <button
        type="button"
        onClick={() => navigate(-1)}
        className={cn(linkClassName, className)}
      >
        {icon}
        Back
      </button>
    )
  }

  return (
    <Link to={to} className={cn(linkClassName, className)}>
      {icon}
      Back
    </Link>
  )
}
