import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'

export function ProtectedRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Skeleton className="h-6 w-32" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />
  }

  return <Outlet />
}
