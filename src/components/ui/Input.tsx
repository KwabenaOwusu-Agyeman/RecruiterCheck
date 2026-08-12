import { type InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/utils/cn'

export type InputProps = InputHTMLAttributes<HTMLInputElement>

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        'flex h-12 w-full rounded-xl border border-border bg-surface px-3 py-2 text-base text-text-primary',
        'sm:h-[44px] sm:rounded-[10px] sm:border-border-strong sm:text-sm',
        'placeholder:text-text-secondary/60',
        'transition-[border-color,box-shadow] duration-150 sm:duration-[180ms]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50 sm:disabled:bg-surface-muted',
        className,
      )}
      {...props}
    />
  )
})

Input.displayName = 'Input'
