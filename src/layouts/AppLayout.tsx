import { Outlet } from 'react-router-dom'
import { Container } from '@/components/ui/Container'
import { AppBottomNav } from '@/layouts/AppBottomNav'
import { AppHeader } from '@/layouts/AppHeader'

export function AppLayout() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-hero">
      <div className="pointer-events-none absolute inset-0 bg-glow-navy" aria-hidden="true" />
      <AppHeader />
      <main className="relative flex-1 pb-[calc(80px+env(safe-area-inset-bottom))] sm:pb-0">
        <Container className="pb-[40px] pt-[12px] sm:pb-10 sm:pt-4 lg:max-w-[1120px] lg:pb-[48px] lg:pt-[32px]">
          {<Outlet />}
        </Container>
      </main>
      <AppBottomNav />
    </div>
  )
}
