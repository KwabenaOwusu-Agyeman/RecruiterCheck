import { Link } from 'react-router-dom'
import { cn } from '@/utils/cn'
import { BRAND } from '@/lib/constants'

interface LogoProps {
  className?: string
}

export function Logo({ className }: LogoProps) {
  return (
    <Link
      to="/"
      className={cn('inline-flex items-center gap-2.5 text-text-primary', className)}
      aria-label={`${BRAND.name} home`}
    >
      <span className="text-[19px] font-semibold tracking-[-0.025em] text-navy sm:text-[21px]">
        MyRecruiter<span className="text-blue">Check</span>
      </span>
    </Link>
  )
}
