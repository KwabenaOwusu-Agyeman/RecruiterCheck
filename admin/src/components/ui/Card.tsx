import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

// Tone sets the card's own surface directly rather than leaving it to a
// className override. With no tailwind-merge in this project, two utilities for
// the same property resolve by Tailwind's class-discovery order rather than by
// argument order, so an override is not reliable. Add a tone instead.
type CardTone = 'light' | 'muted' | 'dark'

const toneStyles: Record<CardTone, string> = {
  light: 'border-border-soft bg-surface shadow-card',
  muted: 'border-border-strong bg-background',
  dark: 'border-white/15 bg-navy text-white shadow-elevated',
}

interface CardProps {
  children: ReactNode
  className?: string
  tone?: CardTone
}

export function Card({ children, className, tone = 'light' }: CardProps) {
  return (
    <div className={cn('rounded-[20px] border', toneStyles[tone], className)}>{children}</div>
  )
}

export function CardHeader({ children, className, tone = 'light' }: CardProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4',
        tone === 'dark' ? 'border-white/10' : 'border-border',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CardContent({ children, className }: CardProps) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('text-lg font-semibold tracking-tight', className)}>{children}</h2>
}
