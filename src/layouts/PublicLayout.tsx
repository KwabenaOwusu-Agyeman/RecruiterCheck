import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AuthModal } from '@/features/auth/components/AuthModal'
import { AuthModalProvider, useAuthModal } from '@/features/auth/context/AuthModalContext'
import { PublicFooter } from '@/features/landing/components/PublicFooter'
import { PublicHeader } from '@/features/landing/components/PublicHeader'

function PublicLayoutContent() {
  const location = useLocation()
  const navigate = useNavigate()
  const { open } = useAuthModal()

  useEffect(() => {
    if (location.pathname === '/sign-in') {
      open('sign-in')
      navigate('/', { replace: true, state: undefined })
    } else if (location.pathname === '/sign-up') {
      open('sign-up')
      navigate('/', { replace: true, state: undefined })
    }
  }, [location.pathname, open, navigate])

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <PublicHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <PublicFooter />
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
