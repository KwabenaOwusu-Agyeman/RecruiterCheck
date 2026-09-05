import type { ButtonHTMLAttributes, ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-navy text-white border border-navy hover:bg-navy/90',
  secondary:
    'bg-surface text-text-primary border border-border-strong hover:border-navy/40 hover:bg-background',
  ghost: 'bg-transparent text-text-secondary border border-transparent hover:bg-border-soft',
  danger: 'bg-error text-white border border-error hover:bg-error/90',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-base',
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:pointer-events-none disabled:opacity-50'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(base, variantStyles[variant], sizeStyles[size], className)}
      {...props}
    />
  )
}

export function ButtonLink({
  href,
  children,
  variant = 'secondary',
  size = 'sm',
  className,
  prefetch,
}: {
  href: string
  children: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  prefetch?: boolean
}) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={cn(base, variantStyles[variant], sizeStyles[size], className)}
    >
      {children}
    </Link>
  )
}
