import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/utils/cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'light' | 'accent'
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
  // White pill for use on a dark card (Card variant className="bg-navy" etc.)
  // — a first-class variant rather than overriding secondary/primary's own
  // bg-*/text-* classes via className, since Tailwind's generated CSS order
  // is determined by codebase-wide class discovery order, not by where a
  // className string sits in this component's cn() call, so overriding a
  // variant's own color utility from the outside is not reliable.
  light:
    'bg-white text-navy border border-transparent hover:bg-white/90 focus-visible:ring-white hover:shadow-hover',
  // Bright accent pill for the single primary CTA on a dark card, distinct
  // from the neutral white `light` buttons used for secondary actions there.
  accent:
    'bg-blue-light text-navy border border-transparent hover:bg-blue-light/90 focus-visible:ring-blue-light hover:shadow-hover sm:hover:-translate-y-px',
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
