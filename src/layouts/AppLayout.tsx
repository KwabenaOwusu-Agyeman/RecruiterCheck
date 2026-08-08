import { Outlet } from 'react-router-dom'
import { Container } from '@/components/ui/Container'
import { AppBottomNav } from '@/layouts/AppBottomNav'
import { AppHeader } from '@/layouts/AppHeader'

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main className="flex-1 pb-20 sm:pb-0">
        <Container className="pb-10 pt-4">{<Outlet />}</Container>
      </main>
      <AppBottomNav />
    </div>
  )
}
