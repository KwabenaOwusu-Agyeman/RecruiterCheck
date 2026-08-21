import { Outlet } from 'react-router-dom'
import { Container } from '@/components/ui/Container'
import { AppBottomNav } from '@/layouts/AppBottomNav'
import { AppHeader } from '@/layouts/AppHeader'

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main className="flex-1 pb-[calc(80px+env(safe-area-inset-bottom))] sm:pb-0">
        <Container className="pb-[48px] pt-[20px] sm:pb-12 sm:pt-8 lg:max-w-[1120px] lg:pb-[56px] lg:pt-[40px]">
          {<Outlet />}
        </Container>
      </main>
      <AppBottomNav />
    </div>
  )
}
