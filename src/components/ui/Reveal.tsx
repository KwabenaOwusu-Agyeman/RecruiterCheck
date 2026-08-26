import { type ReactNode } from 'react'
import { useRevealOnScroll } from '@/hooks/useRevealOnScroll'
import { cn } from '@/utils/cn'

interface RevealProps {
  children: ReactNode
  className?: string
}

/**
 * Fades and slides a section up into place the first time it scrolls into
 * view, the same "content arrives as you scroll" feel monday.com's landing
 * page uses throughout. Fires slightly before the element is fully on
 * screen (`rootMargin: '-80px'`) and never re-triggers on scroll-back, so it
 * reads as a one-time reveal, not a distracting repeat effect.
 */
export function Reveal({ children, className }: RevealProps) {
  const [ref, isVisible] = useRevealOnScroll<HTMLDivElement>({ amount: 0.2, rootMargin: '-80px' })

  return (
    <div ref={ref} className={cn(!isVisible && 'opacity-0', isVisible && 'animate-fade-in-up', className)}>
      {children}
    </div>
  )
}
