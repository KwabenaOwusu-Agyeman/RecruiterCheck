import { type ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface AlertProps {
  children: ReactNode
  variant?: 'error' | 'success' | 'info'
  className?: string
}

const variantStyles = {
  error: 'border-error/20 bg-error/5 text-error',
  success: 'border-success/20 bg-success/10 text-success',
  info: 'border-border bg-background text-text-secondary',
}

function AlertIcon({ variant }: { variant: 'error' | 'success' | 'info' }) {
  if (variant === 'success') {
    return (
      <svg viewBox="0 0 20 20" fill="none" className="mt-0.5 h-[16px] w-[16px] shrink-0" aria-hidden="true">
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M6.5 10.2l2.2 2.2 4.8-4.8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  if (variant === 'error') {
    return (
      <svg viewBox="0 0 20 20" fill="none" className="mt-0.5 h-[16px] w-[16px] shrink-0" aria-hidden="true">
        <path
          d="M10 2.2 18 16.2H2L10 2.2Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M10 8v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10" cy="13.7" r="0.9" fill="currentColor" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 20 20" fill="none" className="mt-0.5 h-[16px] w-[16px] shrink-0" aria-hidden="true">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 9v4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="6.5" r="0.9" fill="currentColor" />
    </svg>
  )
}

export function Alert({ children, variant = 'info', className }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm',
        variantStyles[variant],
        className,
      )}
    >
      <AlertIcon variant={variant} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
