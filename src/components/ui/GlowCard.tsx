import { type ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface GlowCardProps {
  children: ReactNode
  className?: string
}

/**
 * Wraps a card with a soft border glow that fades in on hover, the kind of
 * subtle premium-SaaS polish used on Cursor's and similar sites. Styled
 * entirely from `.glow-card-border` in index.css (see the comment there) —
 * no inline `style`, since the CSP's style-src has no 'unsafe-inline' and no
 * per-frame hash to allow one.
 */
export function GlowCard({ children, className }: GlowCardProps) {
  return (
    <div className={cn('group relative rounded-[20px]', className)}>
      <div
        aria-hidden="true"
        className="glow-card-border pointer-events-none absolute inset-0 z-10 rounded-[20px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />
      {children}
    </div>
  )
}
