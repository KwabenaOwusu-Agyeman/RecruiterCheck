import { useEffect, useRef, useState, type RefObject } from 'react'

interface UseRevealOnScrollOptions {
  /**
   * Fraction of the target that must be visible before it's considered "in
   * view". Keep this at 0 for anything that wraps a whole section: a
   * section taller than the phone viewport can never reach a fraction like
   * 0.2, so it would sit at `opacity: 0` forever on mobile.
   */
  amount?: number
  /** Shrinks (negative) or grows (positive) the viewport used for the intersection check, e.g. '-80px'. */
  rootMargin?: string
}

/**
 * IntersectionObserver-based replacement for motion/react's `useInView` +
 * `whileInView`, used for the site's scroll-reveal effect. motion/react
 * animates via inline `style` attributes, which the CSP's `style-src`
 * (no 'unsafe-inline', no hashes for per-frame dynamic values) blocks
 * outright. This only ever returns a boolean — the actual animation is a
 * plain CSS class (`animate-fade-in-up` etc. in tailwind.config.js) applied
 * from the compiled stylesheet, so nothing here touches inline styles.
 */
export function useRevealOnScroll<T extends HTMLElement>(
  { amount = 0, rootMargin = '-80px' }: UseRevealOnScrollOptions = {},
): [RefObject<T>, boolean] {
  const ref = useRef<T>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // No IntersectionObserver support (very old browsers) — show content
    // immediately rather than leaving it permanently hidden.
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
      { threshold: amount, rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [amount, rootMargin])

  return [ref, isVisible]
}
