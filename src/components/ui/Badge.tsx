import { type ReactNode } from 'react'
import { cn } from '@/utils/cn'
import type { CheckStatus } from '@/types'

interface StatusBadgeProps {
  status: CheckStatus
  className?: string
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

const textColors: Record<CheckStatus, string> = {
  draft: 'text-text-secondary',
  processing: 'text-blue',
  completed: 'text-success',
  failed: 'text-error',
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', textColors[status], className)}>
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
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
