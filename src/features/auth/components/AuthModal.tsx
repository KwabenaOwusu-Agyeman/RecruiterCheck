import { type FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { useAuthModal } from '@/features/auth/context/AuthModalContext'
import { FEATURE_FLAGS } from '@/lib/constants'
import {
  signInWithGoogle,
  signInWithLinkedIn,
  signInWithPassword,
  signUpWithPassword,
} from '@/services/authService'

export function AuthModal() {
  const { mode, close, setMode } = useAuthModal()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!mode) return
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setMessage(null)
    setError(null)
    setLoadingProvider(null)
  }, [mode])

  useEffect(() => {
    if (!mode) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [mode, close])

  if (!mode) return null

  async function handleOAuth(provider: 'google' | 'linkedin', action: () => Promise<void>) {
    setError(null)
    setMessage(null)
    setLoadingProvider(provider)

    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start sign in')
      setLoadingProvider(null)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setMessage(null)

    if (mode === 'sign-up' && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoadingProvider('email')

    try {
      if (mode === 'sign-up') {
        const needsConfirmation = await signUpWithPassword(email.trim(), password)
        if (needsConfirmation) {
          setMessage('Check your email to confirm your account.')
        } else {
          close()
          navigate('/checks')
        }
      } else {
        await signInWithPassword(email.trim(), password)
        close()
        navigate('/checks')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete sign in')
    } finally {
      setLoadingProvider(null)
    }
  }

  const title = mode === 'sign-in' ? 'Sign In' : 'Get started'
  const alternateMode = mode === 'sign-in' ? 'sign-up' : 'sign-in'
  const alternateLabel = mode === 'sign-in' ? 'Sign Up' : 'Sign In'
  const submitLabel = mode === 'sign-up' ? 'Create free account' : 'Sign In'
  const submitLoadingLabel = mode === 'sign-up' ? 'Creating account...' : 'Signing in...'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#05050D]/50 p-4 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          close()
          void navigate('/', { replace: true })
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="relative w-full max-w-sm rounded-2xl border border-navy bg-surface p-6 shadow-lg"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={() => {
            close()
            void navigate('/', { replace: true })
          }}
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg border border-navy text-text-secondary transition-colors hover:bg-background hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M3 3l10 10M13 3L3 13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="mb-6 pr-8">
          <h1 id="auth-modal-title" className="text-2xl font-bold tracking-tight text-text-primary">
            {title}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {mode === 'sign-up'
              ? 'Create your free account to start running recruiter checks.'
              : 'Welcome back. Continue where you left off.'}
          </p>
        </div>

        <div className="space-y-2.5">
          <Button
            type="button"
            variant="secondary"
            className="h-12 w-full gap-2.5 !rounded-full text-base font-semibold"
            disabled={loadingProvider !== null}
            onClick={() => void handleOAuth('google', signInWithGoogle)}
          >
            <GoogleIcon />
            {loadingProvider === 'google' ? 'Connecting...' : 'Continue with Google'}
          </Button>

          {FEATURE_FLAGS.linkedInAuth ? (
            <Button
              type="button"
              variant="secondary"
              className="h-12 w-full gap-2.5 !rounded-full text-base font-semibold"
              disabled={loadingProvider !== null}
              onClick={() => void handleOAuth('linkedin', signInWithLinkedIn)}
            >
              <LinkedInIcon />
              {loadingProvider === 'linkedin' ? 'Connecting...' : 'Continue with LinkedIn'}
            </Button>
          ) : null}
        </div>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs font-semibold tracking-wide text-text-secondary">
            OR CONTINUE WITH EMAIL
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="auth-modal-email">Email address</Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-text-secondary">
                <MailIcon />
              </span>
              <Input
                id="auth-modal-email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-12 pl-10"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="auth-modal-password">Password</Label>
            <Input
              id="auth-modal-password"
              type="password"
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              required
              minLength={6}
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-12"
            />
          </div>

          {mode === 'sign-up' ? (
            <div className="space-y-1.5">
              <Label htmlFor="auth-modal-confirm-password">Confirm password</Label>
              <Input
                id="auth-modal-confirm-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="h-12"
              />
            </div>
          ) : null}

          <Button
            type="submit"
            className="h-12 w-full !rounded-full text-base font-semibold"
            disabled={loadingProvider !== null || !email.trim() || !password}
          >
            {loadingProvider === 'email' ? submitLoadingLabel : submitLabel}
          </Button>
        </form>

        {message ? <Alert variant="success" className="mt-4">{message}</Alert> : null}
        {error ? <Alert variant="error" className="mt-4">{error}</Alert> : null}

        <p className="mt-5 text-center text-sm text-text-secondary">
          {mode === 'sign-in' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            type="button"
            className="font-semibold text-blue hover:underline"
            onClick={() => setMode(alternateMode)}
          >
            {alternateLabel}
          </button>
        </p>
      </div>
    </div>
  )
}

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M3.5 5.5L10 11L16.5 5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.68-3.87 2.68-6.62Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  )
}

function LinkedInIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect width="18" height="18" rx="3" fill="#0A66C2" />
      <path
        d="M5.9 7.2H3.7V14.3H5.9V7.2ZM4.8 6.3C5.5 6.3 6 5.8 6 5.1C6 4.5 5.5 4 4.8 4C4.1 4 3.6 4.5 3.6 5.1C3.6 5.8 4.1 6.3 4.8 6.3ZM14.3 10.2C14.3 8.1 13.2 7.1 11.6 7.1C10.4 7.1 9.8 7.8 9.5 8.3V7.2H7.3V14.3H9.5V10.5C9.5 9.5 9.9 8.9 10.7 8.9C11.5 8.9 12.1 9.5 12.1 10.5V14.3H14.3V10.2Z"
        fill="white"
      />
    </svg>
  )
}
