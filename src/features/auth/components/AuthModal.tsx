import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { AuthCardHeader } from '@/components/ui/AuthCard'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { useAuthModal } from '@/features/auth/context/AuthModalContext'
import { consumePostAuthRedirect } from '@/features/auth/postAuthRedirect'
import { trackEvent } from '@/lib/analytics'
import { FEATURE_FLAGS } from '@/lib/constants'
import {
  resetPasswordForEmail,
  signInWithGoogle,
  signInWithLinkedIn,
  signInWithPassword,
  signUpWithPassword,
} from '@/services/authService'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function AuthModal() {
  const { mode, close, setMode } = useAuthModal()
  const navigate = useNavigate()
  const dialogRef = useRef<HTMLDivElement>(null)

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

  // Focus trap: Tab/Shift+Tab cycle within the dialog instead of escaping to
  // background content, and the first focusable element gets focus on open
  // so keyboard/screen-reader users land inside the dialog immediately.
  useEffect(() => {
    if (!mode) return

    // Focus the email field rather than whatever is first in DOM order (the
    // close button) — that's where a user opening this dialog actually wants
    // to start typing.
    const initialFocusTarget =
      dialogRef.current?.querySelector<HTMLElement>('#auth-modal-email') ??
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    initialFocusTarget?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close()
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
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

  async function handleForgotPassword() {
    setError(null)
    setMessage(null)

    if (!email.trim()) {
      setError('Enter your email above first.')
      return
    }

    setLoadingProvider('forgot-password')
    try {
      await resetPasswordForEmail(email.trim())
      setMessage('Check your email for a password reset link.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset email')
    } finally {
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
        trackEvent('signup_completed')
        if (needsConfirmation) {
          setMessage('Check your email to confirm your account.')
        } else {
          close()
          navigate(consumePostAuthRedirect())
        }
      } else {
        await signInWithPassword(email.trim(), password)
        close()
        navigate(consumePostAuthRedirect())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete sign in')
    } finally {
      setLoadingProvider(null)
    }
  }

  const passwordsMismatch = mode === 'sign-up' && confirmPassword.length > 0 && password !== confirmPassword

  const title = mode === 'sign-in' ? 'Sign In' : 'Get started'
  const alternateMode = mode === 'sign-in' ? 'sign-up' : 'sign-in'
  const alternateLabel = mode === 'sign-in' ? 'Sign Up' : 'Sign In'
  const submitLabel = mode === 'sign-up' ? 'Create free account' : 'Sign In'
  const submitLoadingLabel = mode === 'sign-up' ? 'Creating account...' : 'Signing in...'

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[#05050D]/50 sm:p-[24px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          close()
          void navigate('/', { replace: true })
        }
      }}
    >
      {/* Centering lives on this inner, non-scrolling wrapper rather than on
          the scroll container itself — flex `items-center` + `overflow-y-auto`
          on the same element clips content taller than the viewport (the
          overflow above the centered item is never reachable by scrolling,
          a known Flexbox behavior), which was cutting off the top of this
          modal on short mobile viewports. `min-h-full` lets this wrapper grow
          past the viewport when the dialog is tall, so the outer container's
          natural scrollable area starts at the true top of the content.
          Below `sm` the panel docks to the bottom edge as a native-style
          sheet (`items-end`); at `sm` and up it reverts to a centered modal. */}
      <div className="flex min-h-full items-end justify-center sm:items-center">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
          className="auth-sheet-panel relative flex max-h-[92dvh] w-full max-w-none flex-col overflow-y-auto rounded-t-[24px] border border-border-soft border-b-0 bg-surface p-[16px] pb-[max(16px,env(safe-area-inset-bottom))] shadow-elevated sm:max-h-[calc(100vh-2rem)] sm:max-w-[430px] sm:rounded-[20px] sm:border-b sm:p-[32px] sm:pb-[32px] sm:shadow-glow"
        >
        <div
          className="mx-auto mb-[10px] h-1.5 w-10 shrink-0 rounded-full bg-border sm:hidden"
          aria-hidden="true"
        />
        <button
          type="button"
          aria-label="Close"
          onClick={() => {
            close()
            void navigate('/', { replace: true })
          }}
          className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-lg border border-transparent text-text-secondary transition-colors duration-150 hover:bg-background hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue sm:right-4 sm:top-4 sm:h-9 sm:w-9 sm:hover:bg-surface-muted"
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

        <AuthCardHeader
          titleId="auth-modal-title"
          title={title}
          subtitle={
            mode === 'sign-up'
              ? 'Create your free account to start running recruiter checks.'
              : 'Welcome back. Continue where you left off.'
          }
          className="pr-12"
        />

        <div className="space-y-2 sm:space-y-3">
          <Button
            type="button"
            variant="secondary"
            className="h-[48px] w-full gap-2.5 text-base font-semibold sm:!h-12"
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
              className="h-[48px] w-full gap-2.5 text-base font-semibold sm:!h-12"
              disabled={loadingProvider !== null}
              onClick={() => void handleOAuth('linkedin', signInWithLinkedIn)}
            >
              <LinkedInIcon />
              {loadingProvider === 'linkedin' ? 'Connecting...' : 'Continue with LinkedIn'}
            </Button>
          ) : null}
        </div>

        <div className="mb-[14px] mt-[16px] flex items-center gap-3 sm:mb-[20px] sm:mt-[24px]">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs font-semibold tracking-wide text-text-secondary">
            OR CONTINUE WITH EMAIL
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-[14px] sm:gap-[16px]">
          <div className="space-y-[6px]">
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
                className="h-[48px] pl-10 text-base sm:!h-12 sm:text-sm"
              />
            </div>
          </div>

          <div className="space-y-[6px]">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="auth-modal-password">Password</Label>
              {mode === 'sign-in' ? (
                <button
                  type="button"
                  className="text-sm font-semibold text-blue hover:underline"
                  disabled={loadingProvider !== null}
                  onClick={() => void handleForgotPassword()}
                >
                  {loadingProvider === 'forgot-password' ? 'Sending...' : 'Forgot?'}
                </button>
              ) : null}
            </div>
            <PasswordInput
              id="auth-modal-password"
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              required
              minLength={6}
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-[48px] text-base sm:!h-12 sm:text-sm"
            />
          </div>

          {mode === 'sign-up' ? (
            <div className="space-y-[6px]">
              <Label htmlFor="auth-modal-confirm-password">Confirm password</Label>
              <PasswordInput
                id="auth-modal-confirm-password"
                autoComplete="new-password"
                required
                minLength={6}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                aria-invalid={passwordsMismatch}
                className="h-[48px] text-base sm:!h-12 sm:text-sm"
              />
              {passwordsMismatch ? <p className="text-xs text-error">Passwords do not match.</p> : null}
            </div>
          ) : null}

          <Button
            type="submit"
            className="mt-[4px] h-[48px] w-full text-base font-semibold sm:!h-12"
            disabled={
              loadingProvider !== null ||
              !email.trim() ||
              !password ||
              (mode === 'sign-up' && (passwordsMismatch || !confirmPassword))
            }
          >
            {loadingProvider === 'email' ? submitLoadingLabel : submitLabel}
          </Button>
        </form>

        {message ? <Alert variant="success" className="mt-3">{message}</Alert> : null}
        {error ? <Alert variant="error" className="mt-3">{error}</Alert> : null}

        <p className="mt-[14px] text-center text-[13px] text-text-secondary sm:mt-[18px] sm:text-sm">
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
