import { type InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/utils/cn'

export type InputProps = InputHTMLAttributes<HTMLInputElement>

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        'flex h-12 w-full rounded-[10px] border border-border-strong bg-surface px-3 py-2 text-base text-text-primary',
        'sm:h-[44px] sm:text-sm',
        'placeholder:text-text-secondary/60',
        'transition-[border-color,box-shadow] duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface-muted',
        className,
      )}
      {...props}
    />
  )
})

Input.displayName = 'Input'
