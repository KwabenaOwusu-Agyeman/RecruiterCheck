import { type ReactNode } from 'react'
import { cn } from '@/utils/cn'
import type { CheckStatus, EvidenceStrength } from '@/types'

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

interface EvidenceStrengthBadgeProps {
  strength: EvidenceStrength
  className?: string
  tone?: 'light' | 'dark'
}

// Mirrors StatusBadge's own dot-plus-pill structure exactly, and reuses this
// app's existing success/warning/error tokens the same way ScoreLockup.tsx's
// PILL_TONE and verdictColor.ts's getVerdictColor already do for their own
// tiered verdicts — strong=green, moderate=yellow/amber, no evidence=red.
// Never literal emoji.
const evidenceStrengthLabels: Record<EvidenceStrength, string> = {
  strong: 'Strong evidence',
  moderate: 'Moderate evidence',
  none: 'No evidence',
}

const evidenceStrengthDotColors: Record<EvidenceStrength, string> = {
  strong: 'bg-success',
  moderate: 'bg-warning',
  none: 'bg-error',
}

const evidenceStrengthPillColors: Record<EvidenceStrength, string> = {
  strong: 'bg-success/10 text-success-deep',
  moderate: 'bg-warning/15 text-warning-deep',
  none: 'bg-error/10 text-error',
}

const evidenceStrengthDarkPillColors: Record<EvidenceStrength, string> = {
  strong: 'bg-white/10 text-success',
  moderate: 'bg-white/10 text-warning',
  none: 'bg-white/10 text-error-light',
}

export function EvidenceStrengthBadge({ strength, className, tone = 'light' }: EvidenceStrengthBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        tone === 'dark' ? evidenceStrengthDarkPillColors[strength] : evidenceStrengthPillColors[strength],
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', evidenceStrengthDotColors[strength])} />
      {evidenceStrengthLabels[strength]}
    </span>
  )
}

interface ScoreBadgeProps {
  score: number | null
  className?: string
  tone?: 'light' | 'dark'
}

export function ScoreBadge({ score, className, tone = 'light' }: ScoreBadgeProps) {
  if (score === null) {
    return (
      <span className={cn('text-sm', tone === 'dark' ? 'text-white/60' : 'text-text-secondary', className)}>
        N/A
      </span>
    )
  }

  return (
    <span className={cn('text-sm font-medium', tone === 'dark' ? 'text-white' : 'text-text-primary', className)}>
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
    <div className="mb-[24px] flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-start sm:justify-between lg:mb-[40px]">
      <div>
        <h1 className="font-display text-[26px] text-text-primary sm:text-[34px] lg:text-[38px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-2xl text-[15px] text-text-secondary sm:text-base">{description}</p>
        ) : null}
      </div>
      {action ? <div className="w-full shrink-0 sm:w-auto">{action}</div> : null}
    </div>
  )
}
