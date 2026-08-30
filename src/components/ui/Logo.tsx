import { Link } from 'react-router-dom'
import { BrandMark } from '@/components/ui/BrandMark'
import { cn } from '@/utils/cn'
import { BRAND } from '@/lib/constants'

interface LogoProps {
  className?: string
}

export function Logo({ className }: LogoProps) {
  return (
    <Link
      to="/"
      className={cn('inline-flex items-center gap-1.5 text-text-primary', className)}
      aria-label={`${BRAND.name} home`}
    >
      <BrandMark className="h-[21px] w-auto sm:h-[24px]" />
      <span className="text-[19px] font-semibold tracking-[-0.025em] text-navy sm:text-[21px]">
        MyRecruiter<span className="text-blue">Check</span>
      </span>
    </Link>
  )
}
