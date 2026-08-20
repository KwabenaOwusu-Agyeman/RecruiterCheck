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
    'bg-navy text-white border border-navy hover:bg-navy/90 focus-visible:ring-navy hover:shadow-hover sm:hover:-translate-y-px',
  secondary:
    'bg-surface text-text-primary border border-border-strong hover:border-navy/40 hover:bg-background focus-visible:ring-blue hover:shadow-card',
  ghost:
    'bg-transparent text-text-primary border border-transparent hover:bg-background focus-visible:ring-blue',
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
          'inline-flex items-center justify-center rounded-[10px] font-medium',
          'transition-[background-color,color,border-color,transform,box-shadow] duration-150',
          'touch-manipulation active:scale-[0.97] sm:active:scale-100 sm:active:translate-y-px',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50 disabled:hover:shadow-none',
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
