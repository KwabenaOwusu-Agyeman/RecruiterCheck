import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { unsubscribeFromNewsletter } from '@/services/newsletterService'

export function NewsletterUnsubscribePage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  async function handleUnsubscribe() {
    setStatus('loading')
    try {
      await unsubscribeFromNewsletter(token)
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  return (
    <main className="flex min-h-screen items-center bg-background py-16">
      <Container>
        <div className="mx-auto max-w-lg rounded-2xl border border-border bg-surface p-8 text-center">
          <h1 className="text-3xl font-semibold text-text-primary">Newsletter preferences</h1>
          {status === 'success' ? (
            <p className="mt-5 text-text-secondary">You have been unsubscribed from The Recruiter Check.</p>
          ) : (
            <>
              <p className="mt-5 text-text-secondary">You can stop receiving The Recruiter Check at any time.</p>
              <Button className="mt-6" onClick={handleUnsubscribe} disabled={!token || status === 'loading'}>
                {status === 'loading' ? 'Updating…' : 'Unsubscribe'}
              </Button>
              {status === 'error' && <p className="mt-4 text-sm text-red-700" role="alert">We could not update your subscription. Try the link again.</p>}
            </>
          )}
          <div className="mt-6"><Link to="/" className="text-sm font-medium text-blue hover:underline">Return to MyRecruiterCheck</Link></div>
        </div>
      </Container>
    </main>
  )
}

