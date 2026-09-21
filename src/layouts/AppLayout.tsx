import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { Container } from '@/components/ui/Container'
import { Skeleton } from '@/components/ui/Skeleton'
import { AppBottomNav } from '@/layouts/AppBottomNav'
import { AppHeader } from '@/layouts/AppHeader'

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      {/* pan-y: app screens have no horizontal scrollers, so refusing
          horizontal pan gestures outright makes signed-in pages track like
          a native list view instead of drifting sideways under a diagonal
          thumb. pinch-zoom stays allowed. The public pages keep default
          touch-action for the documents swipe row. */}
      <main className="flex-1 pb-[calc(80px+env(safe-area-inset-bottom))] [touch-action:pan-y_pinch-zoom] sm:pb-0">
        <Container className="pb-[48px] pt-[20px] sm:pb-12 sm:pt-8 lg:max-w-[1120px] lg:pb-[56px] lg:pt-[40px]">
          {/* Pages under this layout are lazy (see App.tsx). The header and
              navigation stay put while a page's chunk loads. */}
          <Suspense
            fallback={
              <div className="space-y-4" role="status" aria-label="Loading">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-32 w-full" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </Container>
      </main>
      <AppBottomNav />
    </div>
  )
}
