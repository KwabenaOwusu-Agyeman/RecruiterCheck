import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

// Deep colour variants are used for anything rendered as text on a light
// ground: the base success and warning tokens measure 3.4:1 and 2.2:1 there,
// below AA. The public app documents the same pairing in its Tailwind config.
export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

const toneStyles: Record<BadgeTone, string> = {
  neutral: 'bg-border-soft text-text-secondary border-border-strong',
  success: 'bg-success/10 text-success-deep border-success/30',
  warning: 'bg-warning/10 text-warning-deep border-warning/30',
  danger: 'bg-error/10 text-error border-error/30',
  info: 'bg-navy-tint text-blue border-blue/20',
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: BadgeTone
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        toneStyles[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Maps a check status to a tone once, so every screen agrees on the colour. */
export function checkStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'completed':
      return 'success'
    case 'failed':
      return 'danger'
    case 'processing':
      return 'info'
    case 'draft':
    default:
      return 'neutral'
  }
}
