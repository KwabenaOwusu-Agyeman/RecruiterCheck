import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export function ProtectedRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />
  }

  return <Outlet />
}
