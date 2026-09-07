'use client'

import { useActionState, useState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import {
  sendMagicLinkAction,
  signInAction,
  signInWithGoogleAction,
  type LoginState,
  type MagicLinkState,
} from '../actions'
import { Button } from '@/components/ui/Button'

const initialState: LoginState = { error: null }
const initialMagicLinkState: MagicLinkState = { message: null, error: null }

const fieldStyle =
  'h-10 rounded-full border border-border-strong bg-surface px-4 text-base text-text-primary'

function SubmitButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? busy : idle}
    </Button>
  )
}

/**
 * The Google button navigates with window.location.href rather than letting the
 * Server Action redirect.
 *
 * A Server Action is a form POST, and the Content-Security-Policy sets
 * `form-action 'self'`, which governs the redirects a submission follows as
 * well as where it posts. Chrome enforces that, so a server-side redirect to
 * accounts.google.com can be blocked. Assigning window.location.href is a plain
 * navigation and is not covered by the directive.
 */
function GoogleButton() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const start = () => {
    setError(null)
    startTransition(async () => {
      const result = await signInWithGoogleAction()
      if (result.url) {
        window.location.href = result.url
        return
      }
      setError(result.error ?? 'Google sign-in is unavailable right now.')
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" onClick={start} disabled={pending} className="w-full">
        {pending ? 'Opening Google...' : 'Continue with Google'}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs uppercase tracking-wide text-text-caption">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

function MagicLinkForm() {
  const [state, formAction] = useActionState(sendMagicLinkAction, initialMagicLinkState)

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="magicEmail" className="text-sm font-medium text-text-primary">
          Email me a sign-in link
        </label>
        <input
          id="magicEmail"
          name="magicEmail"
          type="email"
          autoComplete="email"
          required
          className={fieldStyle}
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-error">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="text-sm text-text-secondary">
          {state.message}
        </p>
      ) : null}

      <SubmitButton idle="Send link" busy="Sending..." />
    </form>
  )
}

function PasswordForm() {
  const [state, formAction] = useActionState(signInAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-text-primary">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className={fieldStyle}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-text-primary">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={fieldStyle}
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-error">
          {state.error}
        </p>
      ) : null}

      <SubmitButton idle="Sign in" busy="Signing in..." />
    </form>
  )
}

/**
 * Three ways in, in the order they are most likely to be used. The password
 * form is kept: it is the fallback when a provider is down, and removing a
 * working sign-in method is not something this change is for.
 */
export function LoginForm() {
  return (
    <div className="flex flex-col gap-5">
      <GoogleButton />
      <Divider label="or" />
      <MagicLinkForm />
      <Divider label="or" />
      <PasswordForm />
    </div>
  )
}
