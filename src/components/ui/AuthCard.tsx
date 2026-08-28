import { type ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { cn } from '@/utils/cn'

interface AuthCardHeaderProps {
  title: string
  subtitle?: string
  titleId?: string
  className?: string
}

/** Consistent title/subtitle block reused across every authentication
 *  surface (sign in/up modal, reset password, callback screens) so they
 *  read as one design instead of independently styled pages. */
export function AuthCardHeader({ title, subtitle, titleId, className }: AuthCardHeaderProps) {
  return (
    <div className={cn('mb-[16px] sm:mb-[24px]', className)}>
      <h1 id={titleId} className="text-[20px] font-semibold text-text-primary sm:text-2xl">
        {title}
      </h1>
      {subtitle ? <p className="mt-[6px] text-[13px] text-text-secondary sm:text-sm">{subtitle}</p> : null}
    </div>
  )
}

interface AuthCardProps {
  children: ReactNode
  className?: string
}

/** Compact bordered shell for standalone auth pages (reset password, auth
 *  callback) — the modal (AuthModal) supplies its own sheet/dialog chrome
 *  and uses only AuthCardHeader, not this wrapper. */
export function AuthCard({ children, className }: AuthCardProps) {
  return (
    <Card className={cn('w-full max-w-[400px]', className)}>
      <CardContent className="px-6 py-6 sm:px-8 sm:py-8">{children}</CardContent>
    </Card>
  )
}
