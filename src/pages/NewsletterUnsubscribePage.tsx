import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
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
        <Card className="mx-auto max-w-lg text-center">
          <CardContent className="p-8">
            <h1 className="text-3xl font-semibold text-text-primary">Newsletter preferences</h1>
            {status === 'success' ? (
              <p className="mt-5 text-text-secondary">You have been unsubscribed from The Recruiter Check.</p>
            ) : (
              <>
                <p className="mt-5 text-text-secondary">You can stop receiving The Recruiter Check at any time.</p>
                <Button className="mt-6" onClick={handleUnsubscribe} disabled={!token || status === 'loading'}>
                  {status === 'loading' ? 'Updating…' : 'Unsubscribe'}
                </Button>
                {status === 'error' && (
                  <Alert variant="error" className="mt-4 text-left">
                    We could not update your subscription. Try the link again.
                  </Alert>
                )}
              </>
            )}
            <div className="mt-6">
              <Link to="/" className="text-sm font-medium text-blue hover:underline">
                Return to MyRecruiterCheck
              </Link>
            </div>
          </CardContent>
        </Card>
      </Container>
    </main>
  )
}

