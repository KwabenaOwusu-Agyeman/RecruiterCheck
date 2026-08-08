import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { Logo } from '@/components/ui/Logo'
import { useAuthModal } from '@/features/auth/context/AuthModalContext'
import { useAuth } from '@/hooks/useAuth'

export function PublicHeader() {
  const { session } = useAuth()
  const { open } = useAuthModal()

  return (
    <header className="border-b border-border bg-surface">
      <Container>
        <div className="flex h-16 items-center justify-between">
          <Logo />

          <div className="flex items-center gap-2">
            {session ? (
              <Link to="/checks">
                <Button variant="primary" size="sm">
                  My Checks
                </Button>
              </Link>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => open('sign-in')}>
                  Sign In
                </Button>
                <Button variant="primary" size="sm" onClick={() => open('sign-up')}>
                  Sign Up
                </Button>
              </>
            )}
          </div>
        </div>
      </Container>
    </header>
  )
}
