import { Container } from '@/components/ui/Container'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { useAuthModal } from '@/features/auth/context/AuthModalContext'
import { useCheckCta } from '@/hooks/useCheckCta'

const navLinks = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#example', label: 'See an example' },
] as const

export function PublicHeader() {
  const { open } = useAuthModal()
  const handleCheckCta = useCheckCta()

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/80 pt-[env(safe-area-inset-top)] backdrop-blur-md sm:static sm:bg-surface sm:backdrop-blur-none lg:sticky lg:border-b-border-soft lg:bg-surface/85 lg:backdrop-blur-md">
      <Container>
        <div className="flex h-14 items-center justify-between sm:h-16 lg:h-[72px]">
          <Logo />

          <nav
            className="hidden items-center gap-1 lg:flex"
            aria-label="Site sections"
          >
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-lg px-3.5 py-2 text-sm font-medium text-text-secondary transition-colors duration-150 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
              >
                {link.label}
              </a>
            ))}
            <a
              href="/faq"
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-text-secondary transition-colors duration-150 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
            >
              FAQ
            </a>
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <Button variant="ghost" size="sm" onClick={() => open('sign-in')}>
              Sign In
            </Button>
            <Button size="sm" onClick={handleCheckCta}>
              Check My Application
            </Button>
          </div>
        </div>
      </Container>
    </header>
  )
}
