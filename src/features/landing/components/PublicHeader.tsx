import { Container } from '@/components/ui/Container'
import { Logo } from '@/components/ui/Logo'

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/80 pt-[env(safe-area-inset-top)] backdrop-blur-md sm:static sm:bg-surface sm:backdrop-blur-none">
      <Container>
        <div className="flex h-14 items-center sm:h-16">
          <Logo />
        </div>
      </Container>
    </header>
  )
}
