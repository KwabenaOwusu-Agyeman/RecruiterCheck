import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/utils/cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-navy text-white border border-navy hover:bg-navy/90 focus-visible:ring-navy sm:hover:shadow-hover',
  secondary:
    'bg-surface text-text-primary border border-navy hover:bg-background focus-visible:ring-blue sm:border-border-strong sm:hover:border-navy/40 sm:hover:shadow-card',
  ghost:
    'bg-transparent text-text-primary border border-navy hover:bg-background focus-visible:ring-blue sm:border-transparent sm:hover:bg-background',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-12 px-3 text-sm sm:h-[36px] sm:px-3',
  md: 'h-12 px-4 text-sm sm:h-[44px] sm:px-4',
  lg: 'h-[52px] px-5 text-sm sm:h-[48px] sm:px-5',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex items-center justify-center rounded-xl font-medium sm:rounded-[10px]',
          'transition-[background-color,color,border-color,transform,box-shadow] duration-150 sm:duration-[180ms]',
          'touch-manipulation active:scale-[0.97] sm:active:scale-100 sm:active:translate-y-px',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50 sm:disabled:hover:shadow-none',
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        {...props}
      />
    )
  },
)

Button.displayName = 'Button'
