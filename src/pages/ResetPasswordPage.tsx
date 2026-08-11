import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Logo } from '@/components/ui/Logo'
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
        <div className="w-full max-w-[400px] space-y-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              Set a new password
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Choose a new password for your account.
            </p>
          </div>

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
                <Input
                  id="reset-password"
                  type="password"
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
                <Input
                  id="reset-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="!h-12"
                />
              </div>

              <Button
                type="submit"
                className="!h-12 w-full !rounded-full text-base font-semibold"
                disabled={submitting || !password || !confirmPassword}
              >
                {submitting ? 'Updating...' : 'Update password'}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-text-secondary">Verifying your reset link...</p>
          )}

          {error ? <Alert variant="error">{error}</Alert> : null}
        </div>
      </Container>
    </div>
  )
}
