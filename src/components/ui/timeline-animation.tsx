import { type ElementType, type ReactNode, type RefObject, useEffect, useState, createElement } from 'react'
import { cn } from '@/utils/cn'

interface TimelineContentProps {
  as?: ElementType
  animationNum: number
  timelineRef: RefObject<HTMLElement>
  className?: string
  children: ReactNode
}

// Fixed, literal (not interpolated) arbitrary-value classes so Tailwind's
// build-time class scanner can find them — a template-string class name
// built from a runtime variable wouldn't be. Covers the only stagger this
// component is ever used with (HowItWorksSection's 3 steps); add another
// entry here if a 4th ever shows up instead of computing a delay at runtime.
const STAGGER_DELAY_CLASS = ['[animation-delay:0ms]', '[animation-delay:120ms]', '[animation-delay:240ms]']

// Scroll-reveal wrapper: elements fade/slide in once `timelineRef` enters the
// viewport, staggered by `animationNum`. Plain CSS class + keyframes (see
// tailwind.config.js), not a motion/react inline `style` attribute, so it
// isn't blocked by the CSP's style-src.
export function TimelineContent({ as = 'div', animationNum, timelineRef, className, children }: TimelineContentProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = timelineRef.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.2 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [timelineRef])

  return createElement(
    as,
    {
      className: cn(
        !isVisible && 'opacity-0',
        isVisible && 'animate-fade-in-up',
        isVisible && (STAGGER_DELAY_CLASS[animationNum] ?? ''),
        className,
      ),
    },
    children,
  )
}
