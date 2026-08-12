import { Link } from 'react-router-dom'
import { cn } from '@/utils/cn'

interface LogoProps {
  className?: string
}

export function Logo({ className }: LogoProps) {
  return (
    <Link
      to="/"
      className={cn('inline-flex items-center gap-2.5 text-text-primary', className)}
      aria-label="RecruiterCheck home"
    >
      <span className="text-[18px] font-extrabold tracking-tight text-navy sm:text-xl">
        RecruiterCheck
      </span>
    </Link>
  )
}
