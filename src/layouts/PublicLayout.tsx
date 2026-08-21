import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AuthModal } from '@/features/auth/components/AuthModal'
import { AuthModalProvider, useAuthModal } from '@/features/auth/context/AuthModalContext'
import { storePostAuthRedirect } from '@/features/auth/postAuthRedirect'
import { PublicFooter } from '@/features/landing/components/PublicFooter'
import { PublicHeader } from '@/features/landing/components/PublicHeader'
import { StickyMobileCta } from '@/features/landing/components/StickyMobileCta'

function PublicLayoutContent() {
  const location = useLocation()
  const navigate = useNavigate()
  const { open } = useAuthModal()

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
    <div className="flex min-h-screen flex-col bg-surface pb-16 sm:pb-0">
      <PublicHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <PublicFooter />
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
