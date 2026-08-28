import { type ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface EmptyStateProps {
  title: string
  description: string
  action?: ReactNode
  /** Optional small illustration above the title — a ghost of the content this state is waiting for. */
  visual?: ReactNode
  className?: string
}

/**
 * An empty state is the first screen a new user meets after signing up, so
 * it carries the same care as a landing section: the display face for the
 * title, and room for a ghost visual of what will live here — an empty
 * page that shows the shape of a full one reads as an invitation, where a
 * bare sentence reads as an error.
 */
export function EmptyState({ title, description, action, visual, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-[20px] border border-border-soft bg-surface px-6 py-16 text-center shadow-card sm:py-20',
        className,
      )}
    >
      {visual ? (
        <div className="mb-7 w-full max-w-[300px]" aria-hidden="true">
          {visual}
        </div>
      ) : null}
      <h2 className="font-display text-[24px] text-text-primary">{title}</h2>
      <p className="mt-2 max-w-sm text-[15px] text-text-secondary">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}
