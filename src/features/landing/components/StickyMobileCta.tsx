import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { useAuthModal } from '@/features/auth/context/AuthModalContext'
import { useCheckCta } from '@/hooks/useCheckCta'
import { cn } from '@/utils/cn'

export function StickyMobileCta() {
  const { mode } = useAuthModal()
  const handleCheckCta = useCheckCta()
  const location = useLocation()
  const modalOpen = mode !== null

  // Deferred while one of the page's own check actions is on screen — the
  // hero CTA ([data-hero-cta]) or the closing navy card ([data-closing-cta]).
  // Rendering unconditionally meant two buttons for the same action in one
  // viewport with different words: "Check My Application" in the hero or
  // the closing card, and "Check" fixed at the bottom. Pages without any
  // marked action (legal pages, the 404) keep the always-visible behaviour.
  const [pageCtaVisible, setPageCtaVisible] = useState(false)

  useEffect(() => {
    const pageCtas = document.querySelectorAll('[data-hero-cta], [data-closing-cta]')
    if (pageCtas.length === 0 || typeof IntersectionObserver === 'undefined') {
      setPageCtaVisible(false)
      return
    }
    setPageCtaVisible(true)
    const visible = new Set<Element>()
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target)
        else visible.delete(entry.target)
      }
      setPageCtaVisible(visible.size > 0)
    })
    pageCtas.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [location.pathname])

  const hidden = modalOpen || pageCtaVisible

  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background px-4 pt-3 transition-opacity duration-200 sm:hidden',
        'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        hidden && 'pointer-events-none opacity-0',
      )}
      aria-hidden={hidden}
    >
      <Button
        size="lg"
        className="h-12 w-full text-base"
        onClick={handleCheckCta}
        tabIndex={hidden ? -1 : undefined}
      >
        Check
      </Button>
    </div>
  )
}
