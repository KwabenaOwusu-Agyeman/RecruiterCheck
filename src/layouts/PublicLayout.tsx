import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AuthModal } from '@/features/auth/components/AuthModal'
import { AuthModalProvider, useAuthModal } from '@/features/auth/context/AuthModalContext'
import { storePostAuthRedirect } from '@/features/auth/postAuthRedirect'
import { BackLink } from '@/components/ui/BackLink'
import { Container } from '@/components/ui/Container'
import { PublicFooter } from '@/features/landing/components/PublicFooter'
import { PublicHeader } from '@/features/landing/components/PublicHeader'
import { StickyMobileCta } from '@/features/landing/components/StickyMobileCta'

function PublicLayoutContent() {
  const location = useLocation()
  const navigate = useNavigate()
  const { open } = useAuthModal()
  const isLanding = location.pathname === '/'

  useEffect(() => {
    if (location.pathname === '/sign-in') {
      const from = (location.state as { from?: string } | null)?.from
      if (from) storePostAuthRedirect(from)
      open('sign-in')
      navigate('/', { replace: true, state: undefined })
    } else if (location.pathname === '/sign-up') {
      const from = (location.state as { from?: string } | null)?.from
      if (from) storePostAuthRedirect(from)
      open('sign-up')
      navigate('/', { replace: true, state: undefined })
    }
  }, [location.pathname, location.state, open, navigate])

  return (
    <div className="flex min-h-screen flex-col bg-background pb-16 sm:pb-0">
      <PublicHeader />
      <main className="flex-1">
        {/* Every public page except the landing page gets a back link. The
            footer is landing-page-only now, so an SEO page, the pricing page
            or a legal page otherwise offered no way back except the browser
            chrome — and a visitor arriving from a search result has no
            in-app history at all, which is what BackLink's fallback covers. */}
        {isLanding ? null : (
          <Container className="pt-5 sm:pt-6">
            <BackLink />
          </Container>
        )}
        <Outlet />
      </main>
      {/* The footer is a landing-page element only: every other public page
          (SEO pages, pricing, legal) ends on its own call to action, and a
          second full sitemap under it competed with that. */}
      {isLanding ? <PublicFooter /> : null}
      <StickyMobileCta />
      <AuthModal />
    </div>
  )
}

export function PublicLayout() {
  return (
    <AuthModalProvider>
      <PublicLayoutContent />
    </AuthModalProvider>
  )
}
