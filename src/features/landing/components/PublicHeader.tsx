import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { Logo } from '@/components/ui/Logo'
import { useAuth } from '@/hooks/useAuth'

export function PublicHeader() {
  const { session } = useAuth()

  return (
    <header className="border-b border-border bg-surface">
      <Container>
        <div className="flex h-16 items-center justify-between">
          <Logo />

          {session ? (
            <Link to="/checks">
              <Button variant="primary" size="sm">
                My Checks
              </Button>
            </Link>
          ) : null}
        </div>
      </Container>
    </header>
  )
}
