import { type ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface AlertProps {
  children: ReactNode
  variant?: 'error' | 'success' | 'info'
  className?: string
}

const variantStyles = {
  error: 'border-error/20 bg-[#FCEFEF] text-error',
  success: 'border-success/20 bg-success/10 text-success',
  info: 'border-border bg-background text-text-secondary',
}

export function Alert({ children, variant = 'info', className }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn('rounded-lg border px-4 py-3 text-sm', variantStyles[variant], className)}
    >
      {children}
    </div>
  )
}
