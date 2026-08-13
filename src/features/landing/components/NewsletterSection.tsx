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
    <section className="border-t border-border bg-navy py-12 sm:py-16">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">The Recruiter Check</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            One practical application improvement every week
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-white/75">
            Read it in three minutes. Use it before your next application.
          </p>

          {status === 'success' ? (
            <p className="mt-6 rounded-xl bg-white px-5 py-4 font-medium text-navy" role="status">
              {message}
            </p>
          ) : (
            <form className="mx-auto mt-7 max-w-xl text-left" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-3 sm:flex-row">
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
                  {status === 'loading' ? 'Subscribing…' : 'Send Me the Next Check'}
                </Button>
              </div>
              <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm leading-5 text-white/75">
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

