import { type TextareaHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/utils/cn'

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'flex min-h-[160px] w-full rounded-[10px] border border-border-strong bg-surface px-3 py-2 text-base leading-relaxed text-text-primary',
          'sm:text-sm',
          'placeholder:text-text-secondary/60',
          'transition-[border-color,box-shadow] duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface-muted',
          className,
        )}
        {...props}
      />
    )
  },
)

Textarea.displayName = 'Textarea'
