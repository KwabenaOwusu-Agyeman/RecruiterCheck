import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
      <p className="text-base font-medium text-text-primary">{title}</p>
      {description ? (
        <p className="max-w-md text-sm text-text-secondary">{description}</p>
      ) : null}
      {action}
    </div>
  )
}

/**
 * Shown wherever a figure cannot be calculated. Deliberately distinct from a
 * zero: on a dashboard the two look alike and mean opposite things, and
 * confusing them is how someone concludes nothing happened when in fact
 * nothing was measured.
 */
export function Unavailable({ reason, className }: { reason: string; className?: string }) {
  return (
    <span
      className={cn('inline-flex flex-col gap-0.5', className)}
      title={reason}
    >
      <span className="text-xl font-semibold text-text-caption">Unavailable</span>
      <span className="text-xs font-normal leading-snug text-text-caption">{reason}</span>
    </span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-md bg-border-soft', className)}
      aria-hidden="true"
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </div>
  )
}

export function ErrorState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div
      role="alert"
      className="rounded-[20px] border border-error/30 bg-error/5 px-5 py-4"
    >
      <p className="text-base font-medium text-error">{title}</p>
      {detail ? <p className="mt-1 text-sm text-text-secondary">{detail}</p> : null}
    </div>
  )
}

export function Alert({
  tone = 'warning',
  title,
  children,
}: {
  tone?: 'warning' | 'danger' | 'info'
  title: string
  children?: ReactNode
}) {
  const tones = {
    warning: 'border-warning/30 bg-warning/5',
    danger: 'border-error/30 bg-error/5',
    info: 'border-blue/20 bg-navy-tint',
  } as const
  const titleTones = {
    warning: 'text-warning-deep',
    danger: 'text-error',
    info: 'text-blue',
  } as const

  return (
    <div role="alert" className={cn('rounded-[16px] border px-4 py-3', tones[tone])}>
      <p className={cn('text-sm font-semibold', titleTones[tone])}>{title}</p>
      {children ? <div className="mt-1 text-sm text-text-secondary">{children}</div> : null}
    </div>
  )
}
