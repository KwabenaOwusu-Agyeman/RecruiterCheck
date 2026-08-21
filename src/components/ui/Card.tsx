import { type ReactNode } from 'react'
import { cn } from '@/utils/cn'

// Tone sets Card's own border/bg/shadow directly rather than leaving them to
// be overridden via className — two utilities for the same CSS property
// (e.g. a passed-in `bg-navy` fighting this component's own `bg-surface`)
// resolve by Tailwind's codebase-wide class-discovery order, not by where
// the className string sits in the `cn()` call, so an override is not a
// reliable way to recolor this component. Add a new tone here instead.
type CardTone = 'light' | 'light-glow' | 'dark' | 'nested' | 'nested-highlighted'

interface CardProps {
  children: ReactNode
  className?: string
  tone?: CardTone
}

const cardToneStyles: Record<CardTone, string> = {
  light: 'border-border-soft bg-surface shadow-card',
  'light-glow': 'border-border-soft bg-surface shadow-elevated',
  dark: 'border-white/20 bg-navy shadow-elevated',
  nested: 'border-white/10 bg-white/[0.04] shadow-card',
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
        'border-b px-[16px] py-[12px] sm:px-6 sm:py-4 lg:px-[24px] lg:py-[20px]',
        tone === 'light' || tone === 'light-glow' ? 'border-border' : 'border-white/10',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CardContent({ children, className }: CardProps) {
  return (
    <div className={cn('px-[16px] py-[14px] sm:px-6 sm:py-5 lg:px-[24px] lg:py-[24px]', className)}>
      {children}
    </div>
  )
}
