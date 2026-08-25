// HMAC-signed, self-contained OAuth `state` values. There is no
// server-side session to stash a nonce in between instagram-oauth-start and
// instagram-oauth-callback (they're independent edge function invocations,
// and this flow has exactly one operator, not a per-user session), so the
// state parameter carries its own signed timestamp instead: the callback
// verifies the signature and rejects anything stale, which is enough to
// stop both CSRF and replay of an old authorize link.
//
// Uses Web Crypto (`crypto.subtle`), available unmodified in both the
// Supabase Deno edge runtime and Node 19+/tsx, so this file needs no
// runtime-specific branching and can be unit tested directly.

const encoder = new TextEncoder()

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])
}

function toBase64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function createSignedState(secret: string, nowMs: number = Date.now()): Promise<string> {
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(16)).buffer)
  const payload = `${nowMs}.${nonce}`
  const key = await hmacKey(secret)
  const signature = toBase64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)))
  return `${payload}.${signature}`
}

export interface VerifyStateResult {
  valid: boolean
  reason?: 'malformed' | 'bad_signature' | 'expired'
}

export async function verifySignedState(
  secret: string,
  state: string,
  options: { maxAgeMs?: number; nowMs?: number } = {},
): Promise<VerifyStateResult> {
  const maxAgeMs = options.maxAgeMs ?? 10 * 60 * 1000
  const nowMs = options.nowMs ?? Date.now()

  const parts = state.split('.')
  if (parts.length !== 3) return { valid: false, reason: 'malformed' }
  const [timestampStr, nonce, signature] = parts
  const timestamp = Number(timestampStr)
  if (!Number.isFinite(timestamp) || !nonce || !signature) {
    return { valid: false, reason: 'malformed' }
  }

  const payload = `${timestampStr}.${nonce}`
  const key = await hmacKey(secret)
  const expectedSignature = toBase64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)))

  if (signature.length !== expectedSignature.length) return { valid: false, reason: 'bad_signature' }
  let diff = 0
  for (let i = 0; i < signature.length; i++) {
    diff |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i)
  }
  if (diff !== 0) return { valid: false, reason: 'bad_signature' }

  if (Math.abs(nowMs - timestamp) > maxAgeMs) return { valid: false, reason: 'expired' }

  return { valid: true }
}
