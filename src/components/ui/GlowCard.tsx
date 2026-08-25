import { useRef, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface GlowCardProps {
  children: ReactNode
  className?: string
}

/**
 * Wraps a card with a soft, cursor-following border glow, the same
 * proximity-glow pattern used on Cursor's and other premium SaaS sites.
 * Position is written straight to the DOM via a ref rather than React state
 * so the glow can track the pointer at 60fps without re-rendering children.
 */
export function GlowCard({ children, className }: GlowCardProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)

  function handleMouseMove(event: ReactMouseEvent<HTMLDivElement>) {
    const el = wrapperRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    el.style.setProperty('--glow-x', `${event.clientX - rect.left}px`)
    el.style.setProperty('--glow-y', `${event.clientY - rect.top}px`)
  }

  return (
    <div
      ref={wrapperRef}
      onMouseMove={handleMouseMove}
      className={cn('group relative rounded-[20px]', className)}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 rounded-[20px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          padding: '1.5px',
          background:
            'radial-gradient(220px circle at var(--glow-x, 50%) var(--glow-y, 50%), rgba(25,74,159,0.85), rgba(143,178,240,0.35) 45%, transparent 70%)',
          WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
        }}
      />
      {children}
    </div>
  )
}
