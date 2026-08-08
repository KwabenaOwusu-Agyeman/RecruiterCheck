import { Container } from '@/components/ui/Container'
import { Logo } from '@/components/ui/Logo'

export function PublicHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <Container>
        <div className="flex h-16 items-center">
          <Logo />
        </div>
      </Container>
    </header>
  )
}
