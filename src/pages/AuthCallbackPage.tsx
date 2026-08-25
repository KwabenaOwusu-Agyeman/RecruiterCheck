import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { AuthCard, AuthCardHeader } from '@/components/ui/AuthCard'
import { Container } from '@/components/ui/Container'
import { Logo } from '@/components/ui/Logo'
import { consumePostAuthRedirect } from '@/features/auth/postAuthRedirect'
import { supabase } from '@/lib/supabase'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function handleCallback() {
      const { error: authError } = await supabase.auth.getSession()
      if (authError) {
        setError(authError.message)
        return
      }

      navigate(consumePostAuthRedirect(), { replace: true })
    }

    void handleCallback()
  }, [navigate])

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
