import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/Badge'
import { createExtensionConnectCode } from '@/services/checkService'

// The extension's OAuth-style callback always lives at
// https://<extension-id>.chromiumapp.org/... (assigned by Chrome itself, not
// forgeable by a third party) — restricting redirects to that suffix keeps
// this page from being usable as an open redirect to an arbitrary origin.
function isTrustedExtensionRedirect(url: URL): boolean {
  return url.protocol === 'https:' && url.hostname.endsWith('.chromiumapp.org')
}

export function ExtensionConnectPage() {
  const [searchParams] = useSearchParams()
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)

  const redirectUriParam = searchParams.get('redirect_uri')
  let redirectUrl: URL | null = null
  try {
    if (redirectUriParam) redirectUrl = new URL(redirectUriParam)
  } catch {
    redirectUrl = null
  }
  const validRedirect = redirectUrl && isTrustedExtensionRedirect(redirectUrl)

  async function handleConnect() {
    if (!validRedirect || !redirectUrl) return

    setError(null)
    setConnecting(true)

    try {
      const code = await createExtensionConnectCode()
      setConnected(true)
      redirectUrl.hash = `code=${code}`
      window.location.href = redirectUrl.toString()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect the extension')
      setConnecting(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        title="Connect RecruiterCheck"
        description="Let the RecruiterCheck browser extension send job postings you're viewing straight into your account."
      />

      <div className="mt-[16px] rounded-xl border border-navy bg-surface p-[16px] text-center sm:mt-6 sm:p-8">
        {!validRedirect ? (
          <Alert variant="error">
            This connection request is invalid. Please reopen the RecruiterCheck extension and try
            connecting again.
          </Alert>
        ) : connected ? (
          <p className="text-sm text-text-secondary">Connected. You can close this tab.</p>
        ) : (
          <>
            <p className="text-sm text-text-secondary">
              This will let the extension submit job postings to your RecruiterCheck account. It
              never sees your password.
            </p>
            <Button
              className="mt-[16px] sm:mt-6"
              onClick={() => void handleConnect()}
              disabled={connecting}
            >
              {connecting ? 'Connecting...' : 'Connect RecruiterCheck'}
            </Button>
            {error ? (
              <div className="mt-4">
                <Alert variant="error">{error}</Alert>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
