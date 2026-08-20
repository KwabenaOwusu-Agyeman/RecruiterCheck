import { type ReactNode } from 'react'
import { cn } from '@/utils/cn'
import type { CheckStatus } from '@/types'

interface StatusBadgeProps {
  status: CheckStatus
  className?: string
  tone?: 'light' | 'dark'
}

const labels: Record<CheckStatus, string> = {
  draft: 'Draft',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
}

const dotColors: Record<CheckStatus, string> = {
  draft: 'bg-text-secondary',
  processing: 'bg-blue',
  completed: 'bg-success',
  failed: 'bg-error',
}

const pillColors: Record<CheckStatus, string> = {
  draft: 'bg-text-secondary/10 text-text-secondary',
  processing: 'bg-blue/10 text-blue',
  completed: 'bg-success/10 text-success',
  failed: 'bg-error/10 text-error',
}

const darkPillColors: Record<CheckStatus, string> = {
  draft: 'bg-white/10 text-white/70',
  processing: 'bg-blue-light/15 text-blue-light',
  completed: 'bg-success/15 text-success',
  failed: 'bg-error-light/15 text-error-light',
}

export function StatusBadge({ status, className, tone = 'light' }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        tone === 'dark' ? darkPillColors[status] : pillColors[status],
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dotColors[status])} />
      {labels[status]}
    </span>
  )
}

interface ScoreBadgeProps {
  score: number | null
  className?: string
}

export function ScoreBadge({ score, className }: ScoreBadgeProps) {
  if (score === null) {
    return (
      <span className={cn('text-sm text-text-secondary', className)}>—</span>
    )
  }

  return (
    <span className={cn('text-sm font-medium text-text-primary', className)}>
      {score}%
    </span>
  )
}

interface PageHeaderProps {
  title: string
  description?: string
  action?: ReactNode
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="mb-[20px] flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between lg:mb-[32px]">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-text-primary sm:text-[30px] lg:text-[32px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm text-text-secondary sm:text-base">{description}</p>
        ) : null}
      </div>
      {action ? <div className="w-full shrink-0 sm:w-auto">{action}</div> : null}
    </div>
  )
}
