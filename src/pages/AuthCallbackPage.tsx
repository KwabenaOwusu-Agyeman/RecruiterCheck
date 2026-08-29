import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { AuthCard, AuthCardHeader } from '@/components/ui/AuthCard'
import { Container } from '@/components/ui/Container'
import { Logo } from '@/components/ui/Logo'
import { consumePostAuthRedirect } from '@/features/auth/postAuthRedirect'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const { setSessionImmediate } = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function handleCallback() {
      const { data, error: authError } = await supabase.auth.getSession()
      if (authError) {
        setError(authError.message)
        return
      }

      if (!data.session) {
        // No session on a callback means the link was already used, expired,
        // or the provider round trip failed. Navigating on to a protected
        // route from here would bounce through /sign-in and dump the user on
        // the landing page with no explanation, so say what happened.
        setError('That sign in link has expired or was already used. Please try again.')
        return
      }

      // Push the session into the provider BEFORE navigating, the same way
      // the password path does. Without this, the provider could still be
      // holding session: null when ProtectedRoute mounted at the redirect
      // target — ProtectedRoute would send the user to /sign-in, PublicLayout
      // would swallow that into "/" — and a genuinely signed-in user landed
      // back on the landing page, needing a second click to get where they
      // were already going. setSessionImmediate also fires the welcome email
      // trigger, so that call is no longer duplicated here.
      setSessionImmediate(data.session)
      navigate(consumePostAuthRedirect(), { replace: true })
    }

    void handleCallback()
  }, [navigate, setSessionImmediate])

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Container className="py-8">
        <Logo />
      </Container>

      <Container className="flex flex-1 flex-col items-center justify-center py-16">
        {error ? (
          <AuthCard className="text-center">
            <AuthCardHeader title="Sign in failed" />
            <div className="space-y-4">
              <Alert variant="error">{error}</Alert>
              <Link to="/" className="text-sm font-medium text-blue hover:underline">
                Back to home
              </Link>
            </div>
          </AuthCard>
        ) : (
          <p className="text-sm text-text-secondary">Signing you in...</p>
        )}
      </Container>
    </div>
  )
}
