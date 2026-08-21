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
      <span className="text-[18px] font-extrabold tracking-tight text-navy sm:text-xl">
        MyRecruiter<span className="text-blue">Check</span>
      </span>
    </Link>
  )
}
