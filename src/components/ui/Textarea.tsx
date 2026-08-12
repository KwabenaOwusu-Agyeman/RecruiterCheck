import { type TextareaHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/utils/cn'

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'flex min-h-[160px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-base leading-relaxed text-text-primary',
          'sm:rounded-[10px] sm:border-border-strong sm:text-sm',
          'placeholder:text-text-secondary/60',
          'transition-[border-color,box-shadow] duration-150 sm:duration-[180ms]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50 sm:disabled:bg-surface-muted',
          className,
        )}
        {...props}
      />
    )
  },
)

Textarea.displayName = 'Textarea'
