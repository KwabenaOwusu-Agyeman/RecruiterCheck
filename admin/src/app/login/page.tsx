import type { Metadata } from 'next'
import { LoginForm } from './LoginForm'
import { Card, CardContent } from '@/components/ui/Card'

export const metadata: Metadata = { title: 'Sign in' }

const DENIAL_COPY: Record<string, string> = {
  not_on_allowlist:
    'That account signed in successfully but is not an administrator, so it has no access to this dashboard.',
  account_disabled: 'That administrator account has been disabled.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>
}) {
  const { denied } = await searchParams
  const denialMessage = denied ? DENIAL_COPY[denied] : null

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="font-display text-2xl font-semibold text-navy">MyRecruiterCheck</p>
          <p className="mt-1 text-sm text-text-secondary">Control Centre</p>
        </div>

        <Card>
          <CardContent className="py-6">
            {denialMessage ? (
              <p
                role="alert"
                className="mb-4 rounded-[16px] border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-text-secondary"
              >
                {denialMessage}
              </p>
            ) : null}
            <LoginForm />
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-text-caption">
          This is a private system. Access is restricted to authorised administrators and every
          privileged action is recorded.
        </p>
      </div>
    </main>
  )
}
