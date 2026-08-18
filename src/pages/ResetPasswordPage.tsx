import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { AuthCard, AuthCardHeader } from '@/components/ui/AuthCard'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { Label } from '@/components/ui/Label'
import { Logo } from '@/components/ui/Logo'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { updatePassword } from '@/services/authService'
import { supabase } from '@/lib/supabase'

/** Supabase redirects expired/used/invalid recovery links back here with
 * `error`/`error_description` in the URL hash rather than establishing a
 * session — without this check the page would spin on "Verifying..." forever. */
function readLinkError(): string | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const search = new URLSearchParams(window.location.search)
  const description = hash.get('error_description') ?? search.get('error_description')
  return description ? description.replace(/\+/g, ' ') : null
}

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [linkError] = useState<string | null>(() => readLinkError())
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (linkError) return

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })

    return () => subscription.subscription.unsubscribe()
  }, [linkError])

  const mismatch = confirmPassword.length > 0 && password !== confirmPassword

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      await updatePassword(password)
      navigate('/checks', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Container className="py-8">
        <Logo />
      </Container>

      <Container className="flex flex-1 flex-col items-center justify-center py-16">
        <AuthCard>
          <AuthCardHeader title="Set a new password" subtitle="Choose a new password for your account." />

          {linkError ? (
            <div className="space-y-4">
              <Alert variant="error">{linkError}</Alert>
              <Link to="/sign-in" className="text-sm font-semibold text-blue hover:underline">
                Request a new reset link
              </Link>
            </div>
          ) : ready ? (
            <form onSubmit={(event) => void handleSubmit(event)} className="space-y-[18px]">
              <div className="space-y-1">
                <Label htmlFor="reset-password">New password</Label>
                <PasswordInput
                  id="reset-password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="!h-12"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="reset-confirm-password">Confirm password</Label>
                <PasswordInput
                  id="reset-confirm-password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  aria-invalid={mismatch}
                  className="!h-12"
                />
                {mismatch ? <p className="text-xs text-error">Passwords do not match.</p> : null}
              </div>

              <Button
                type="submit"
                className="!h-12 w-full text-base font-semibold"
                disabled={submitting || !password || !confirmPassword || mismatch}
              >
                {submitting ? 'Updating...' : 'Update password'}
              </Button>

              {error ? <Alert variant="error">{error}</Alert> : null}
            </form>
          ) : (
            <p className="text-sm text-text-secondary">Verifying your reset link...</p>
          )}
        </AuthCard>
      </Container>
    </div>
  )
}
