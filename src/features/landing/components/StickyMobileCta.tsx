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

  // Deferred while the page's own hero action is on screen. Rendering
  // unconditionally meant a phone's first paint showed two buttons for the
  // same action at once — "Check My Application" in the hero and "Check"
  // fixed at the bottom, with different words — and spent ~76px of the
  // first screen doing it. Pages without a marked hero action (legal pages,
  // the 404) keep the old always-visible behaviour.
  const [heroCtaVisible, setHeroCtaVisible] = useState(false)

  useEffect(() => {
    const heroCta = document.querySelector('[data-hero-cta]')
    if (!heroCta || typeof IntersectionObserver === 'undefined') {
      setHeroCtaVisible(false)
      return
    }
    setHeroCtaVisible(true)
    const observer = new IntersectionObserver(([entry]) => {
      setHeroCtaVisible(entry.isIntersecting)
    })
    observer.observe(heroCta)
    return () => observer.disconnect()
  }, [location.pathname])

  const hidden = modalOpen || heroCtaVisible

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
