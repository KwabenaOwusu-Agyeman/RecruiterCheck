import { type ReactNode } from 'react'
import { cn } from '@/utils/cn'

// Tone sets Card's own border/bg/shadow directly rather than leaving them to
// be overridden via className — two utilities for the same CSS property
// (e.g. a passed-in `bg-navy` fighting this component's own `bg-surface`)
// resolve by Tailwind's codebase-wide class-discovery order, not by where
// the className string sits in the `cn()` call, so an override is not a
// reliable way to recolor this component. Add a new tone here instead.
type CardTone =
  | 'light'
  | 'seamless'
  | 'light-elevated'
  | 'dark'
  | 'muted'
  | 'nested'
  | 'nested-light'
  | 'nested-highlighted'

interface CardProps {
  children: ReactNode
  className?: string
  tone?: CardTone
}

const cardToneStyles: Record<CardTone, string> = {
  light: 'border-border-soft bg-surface shadow-card',
  // Same cream as the page behind it, so the card never reads as a
  // high-contrast panel — but the edge is deliberately strong: a dark border
  // with a ring stacked on it for a 2px rule, plus a deep shadow. Seamless
  // ground, bold outline. Used by the testimonial cards.
  seamless: 'border-border-strong bg-background shadow-elevated ring-1 ring-border-strong',
  'light-elevated': 'border-border-soft bg-surface shadow-elevated',
  dark: 'border-white/20 bg-navy shadow-elevated',
  muted: 'border-border-strong bg-border-soft shadow-card',
  nested: 'border-white/10 bg-white/[0.04] shadow-card',
  'nested-light': 'border-border bg-background shadow-card',
  'nested-highlighted': 'border-blue-light/30 bg-white/[0.04] shadow-elevated',
}

export function Card({ children, className, tone = 'light' }: CardProps) {
  return (
    <div className={cn('rounded-[20px] border', cardToneStyles[tone], className)}>
      {children}
    </div>
  )
}

export function CardHeader({ children, className, tone = 'light' }: CardProps) {
  return (
    <div
      className={cn(
        'border-b px-[20px] py-[16px] sm:px-7 sm:py-5 lg:px-[32px] lg:py-[24px]',
        tone === 'light' || tone === 'light-elevated' || tone === 'muted' || tone === 'nested-light'
          ? 'border-border'
          : 'border-white/10',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CardContent({ children, className }: CardProps) {
  return (
    <div className={cn('px-[20px] py-[18px] sm:px-7 sm:py-6 lg:px-[32px] lg:py-[32px]', className)}>
      {children}
    </div>
  )
}
