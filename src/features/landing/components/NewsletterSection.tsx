import { FormEvent, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { Input } from '@/components/ui/Input'
import { subscribeToNewsletter } from '@/services/newsletterService'

export function NewsletterSection() {
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('loading')
    setMessage('')

    try {
      await subscribeToNewsletter(email, consent, 'public_site')
      setStatus('success')
      setMessage('You are subscribed. The next Recruiter Check will arrive by email.')
      setEmail('')
      setConsent(false)
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'We could not save your subscription.')
    }
  }

  return (
    <section className="border-t border-border bg-navy py-8 sm:py-10">
      <Container>
        <div className="mx-auto max-w-xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">The Recruiter Check</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            One recruiter insight every week
          </h2>
          <p className="mx-auto mt-2 text-sm text-white/75 sm:text-base">
            Read it in 15 seconds. Use it before your next application.
          </p>

          {status === 'success' ? (
            <p className="mt-5 rounded-lg bg-white px-4 py-3 text-sm font-medium text-navy" role="status">
              {message}
            </p>
          ) : (
            <form className="mx-auto mt-5 max-w-lg text-left" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-2 sm:flex-row">
                <label htmlFor="newsletter-email" className="sr-only">Email address</label>
                <Input
                  id="newsletter-email"
                  type="email"
                  autoComplete="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="bg-white"
                />
                <Button type="submit" variant="secondary" size="md" disabled={status === 'loading' || !email || !consent} className="shrink-0 bg-white">
                  {status === 'loading' ? 'Subscribing…' : 'Get the Next Check'}
                </Button>
              </div>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-4 text-white/75">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  required
                  className="mt-0.5 h-4 w-4 rounded border-white/40"
                />
                <span>Send me The Recruiter Check newsletter and related career advice. I can unsubscribe at any time.</span>
              </label>
              {status === 'error' && <p className="mt-3 text-sm text-red-200" role="alert">{message}</p>}
            </form>
          )}
        </div>
      </Container>
    </section>
  )
}
