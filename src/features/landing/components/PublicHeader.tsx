import { useEffect, useRef, useState } from 'react'
import { Container } from '@/components/ui/Container'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { useAuthModal } from '@/features/auth/context/AuthModalContext'
import { useCheckCta } from '@/hooks/useCheckCta'

const navLinks = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#example', label: 'See an example' },
] as const

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const desktopLinkClassName =
  'rounded-lg px-3.5 py-2 text-sm font-medium text-text-secondary transition-colors duration-150 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue'

export function PublicHeader() {
  const { open } = useAuthModal()
  const handleCheckCta = useCheckCta()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!mobileNavOpen) return

    const menuButton = menuButtonRef.current
    // Focus the close button, not just "the first focusable element in the
    // panel" — that would be the logo link, which visibly focus-rings on
    // open for no reason a keyboard/screen-reader user would expect.
    closeButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileNavOpen(false)
        return
      }

      if (event.key !== 'Tab' || !panelRef.current) return

      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
      menuButton?.focus()
    }
  }, [mobileNavOpen])

  function closeMobileNav() {
    setMobileNavOpen(false)
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/80 pt-[env(safe-area-inset-top)] backdrop-blur-md sm:static sm:bg-surface sm:backdrop-blur-none lg:sticky lg:border-b-border-soft lg:bg-surface/85 lg:backdrop-blur-md">
      <Container>
        <div className="flex h-14 items-center justify-between sm:h-16 lg:h-[72px]">
          <Logo />

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Site sections">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className={desktopLinkClassName}>
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <Button variant="ghost" size="sm" onClick={() => open('sign-in')}>
              Sign In
            </Button>
            <Button size="sm" onClick={handleCheckCta}>
              Check My Application
            </Button>
          </div>

          <button
            ref={menuButtonRef}
            type="button"
            aria-label="Open menu"
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-nav-panel"
            onClick={() => setMobileNavOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-text-primary transition-colors duration-150 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue lg:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M3 5.5h14M3 10h14M3 14.5h14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </Container>

      {mobileNavOpen ? (
        <div
          className="fixed inset-0 z-30 bg-[#05050D]/50 lg:hidden"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeMobileNav()
          }}
        >
          <div
            ref={panelRef}
            id="mobile-nav-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Site navigation"
            className="absolute inset-x-0 top-0 flex flex-col gap-1 rounded-b-[20px] border-b border-border-soft bg-surface p-4 pt-[calc(env(safe-area-inset-top)+16px)] shadow-elevated"
          >
            <div className="mb-2 flex items-center justify-between">
              <Logo />
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Close menu"
                onClick={closeMobileNav}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-text-secondary transition-colors duration-150 hover:bg-background hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M3 3l10 10M13 3L3 13"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={closeMobileNav}
                className="rounded-lg px-3 py-3 text-base font-medium text-text-primary transition-colors duration-150 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
              >
                {link.label}
              </a>
            ))}

            <div className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
              <Button
                variant="secondary"
                className="w-full justify-center"
                onClick={() => {
                  closeMobileNav()
                  open('sign-in')
                }}
              >
                Sign In
              </Button>
              <Button
                className="w-full justify-center"
                onClick={() => {
                  closeMobileNav()
                  handleCheckCta()
                }}
              >
                Check My Application
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  )
}
