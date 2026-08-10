import { SUPABASE_URL, WEB_APP_URL } from '@/config'
import { supabase } from '@/background/supabaseClient'

export interface SessionInfo {
  connected: boolean
  email: string | null
}

export async function getSessionInfo(): Promise<SessionInfo> {
  const { data } = await supabase.auth.getSession()
  return { connected: Boolean(data.session), email: data.session?.user.email ?? null }
}

/**
 * The "Connect RecruiterCheck" flow: open the web app in a browser-owned
 * auth popup (the user is already signed in there), let them explicitly
 * authorize the extension, and come back with a one-time code — never a
 * password, never a copied session token, never a read of the web app's own
 * localStorage/cookies.
 */
export async function connect(): Promise<void> {
  const redirectUri = chrome.identity.getRedirectURL('callback')
  const connectUrl = `${WEB_APP_URL}/extension/connect?redirect_uri=${encodeURIComponent(redirectUri)}`

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: connectUrl,
    interactive: true,
  })

  if (!responseUrl) {
    throw new Error('Connection was cancelled.')
  }

  const hash = new URL(responseUrl).hash.replace(/^#/, '')
  const code = new URLSearchParams(hash).get('code')
  if (!code) {
    throw new Error('Connection did not complete. Try again.')
  }

  const exchangeRes = await fetch(`${SUPABASE_URL}/functions/v1/exchange-extension-connect-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  const exchangeBody = (await exchangeRes.json().catch(() => ({}))) as {
    email?: string
    tokenHash?: string
    error?: string
  }

  if (!exchangeRes.ok || !exchangeBody.tokenHash || !exchangeBody.email) {
    throw new Error(exchangeBody.error ?? 'Could not connect RecruiterCheck. Try again.')
  }

  // Redeeming the token_hash is what actually establishes this extension's
  // own session — the exchange call above only proved the code was valid
  // and returned a one-time verification value, never a ready-made session.
  const { error } = await supabase.auth.verifyOtp({
    email: exchangeBody.email,
    token_hash: exchangeBody.tokenHash,
    type: 'magiclink',
  })

  if (error) {
    throw new Error('Could not connect RecruiterCheck. Try again.')
  }
}

export async function disconnect(): Promise<void> {
  await supabase.auth.signOut()
}
