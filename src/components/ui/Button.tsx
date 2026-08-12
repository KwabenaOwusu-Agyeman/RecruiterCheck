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
    'bg-navy text-white border border-navy hover:bg-navy/90 focus-visible:ring-navy',
  secondary:
    'bg-surface text-text-primary border border-navy hover:bg-background focus-visible:ring-blue',
  ghost:
    'bg-transparent text-text-primary border border-navy hover:bg-background focus-visible:ring-blue',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-12 px-3 text-sm sm:h-8 sm:px-3',
  md: 'h-12 px-4 text-sm sm:h-9 sm:px-4',
  lg: 'h-[52px] px-5 text-sm sm:h-10 sm:px-5',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex items-center justify-center rounded-xl font-medium sm:rounded-lg',
          'transition-[background-color,color,border-color,transform] duration-150',
          'touch-manipulation active:scale-[0.97] sm:active:scale-100',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
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
