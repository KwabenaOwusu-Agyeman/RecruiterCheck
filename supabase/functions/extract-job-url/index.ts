import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { parseHTML } from 'npm:linkedom@0.16.11'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FETCH_TIMEOUT_MS = 10000
const MAX_RESPONSE_BYTES = 3 * 1024 * 1024
const MAX_EXTRACTED_CHARS = 15000
const MIN_EXTRACTED_CHARS = 100
const MAX_REDIRECTS = 5
const RATE_LIMIT_BUCKET = 'extract-job-url'
const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_SECONDS = 3600
const COULD_NOT_READ_MESSAGE =
  "We couldn't read this job posting. Paste the job description instead."

interface ExtractRequest {
  url: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // Each call fetches an arbitrary external URL server-side — bound how
    // often one user can trigger that (bandwidth, and it's the one path
    // that reaches out to the open internet on the user's behalf).
    const { data: rateLimitAllowed, error: rateLimitError } = await adminClient.rpc(
      'check_and_record_rate_limit',
      {
        p_user_id: user.id,
        p_bucket: RATE_LIMIT_BUCKET,
        p_limit: RATE_LIMIT_MAX,
        p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
      },
    )

    if (rateLimitError) {
      console.error('extract-job-url: rate limit check failed', rateLimitError)
      return jsonResponse({ error: COULD_NOT_READ_MESSAGE }, 500)
    }

    if (!rateLimitAllowed) {
      return jsonResponse({ error: 'Too many requests. Please try again later.' }, 429)
    }

    const { url: rawUrl } = (await req.json()) as ExtractRequest
    if (!rawUrl || typeof rawUrl !== 'string') {
      return jsonResponse({ error: 'url is required' }, 400)
    }

    const safeUrl = await resolveSafeUrl(rawUrl)
    if (!safeUrl) {
      console.error('extract-job-url: rejected unsafe or invalid url')
      return jsonResponse({ error: COULD_NOT_READ_MESSAGE }, 422)
    }

    let response: Response
    try {
      response = await fetchWithSsrfGuard(safeUrl, FETCH_TIMEOUT_MS)
    } catch (error) {
      console.error('extract-job-url: fetch failed', {
        message: error instanceof Error ? error.message : String(error),
      })
      return jsonResponse({ error: COULD_NOT_READ_MESSAGE }, 422)
    }

    if (!response.ok) {
      console.error('extract-job-url: non-2xx response', { status: response.status })
      return jsonResponse({ error: COULD_NOT_READ_MESSAGE }, 422)
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) {
      console.error('extract-job-url: unsupported content-type', { contentType })
      return jsonResponse({ error: COULD_NOT_READ_MESSAGE }, 422)
    }

    let html: string
    try {
      html = await readTextCapped(response, MAX_RESPONSE_BYTES)
    } catch (error) {
      console.error('extract-job-url: response body too large or unreadable', {
        message: error instanceof Error ? error.message : String(error),
      })
      return jsonResponse({ error: COULD_NOT_READ_MESSAGE }, 422)
    }

    const text = extractReadableText(html)

    if (text.length < MIN_EXTRACTED_CHARS) {
      console.error('extract-job-url: extracted text too short', { length: text.length })
      return jsonResponse({ error: COULD_NOT_READ_MESSAGE }, 422)
    }

    return jsonResponse({ jobDescription: text })
  } catch (error) {
    console.error('extract-job-url error:', error)
    return jsonResponse({ error: COULD_NOT_READ_MESSAGE }, 500)
  }
})

/**
 * Validates the URL is http/https and not pointed at a private, loopback, or
 * link-local address (including the common cloud metadata endpoint) — basic
 * SSRF protection for a function that fetches an arbitrary user-supplied
 * URL server-side. Checks both A and AAAA records (a hostname resolving only
 * to a private IPv6 address previously slipped through, since only A records
 * were resolved) and unwraps IPv4-mapped IPv6 literals (::ffff:a.b.c.d)
 * before applying the same private/reserved-range check used for plain IPv4.
 * This is a reasonable baseline, not exhaustive protection against every
 * DNS-rebinding technique — see fetchWithSsrfGuard for why a single
 * resolve-then-fetch isn't enough on its own.
 */
async function resolveSafeUrl(rawUrl: string): Promise<URL | null> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  const hostname = url.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    return null
  }

  if (isLiteralIpAddress(hostname)) {
    return isPrivateOrReservedIp(hostname) ? null : url
  }

  try {
    const [aRecords, aaaaRecords] = await Promise.all([
      Deno.resolveDns(hostname, 'A').catch(() => []),
      Deno.resolveDns(hostname, 'AAAA').catch(() => []),
    ])
    const records = [...aRecords, ...aaaaRecords]
    if (records.length === 0 || records.some((ip) => isPrivateOrReservedIp(ip))) {
      return null
    }
  } catch {
    // Could not resolve — fail closed rather than risk fetching an
    // unvalidated address.
    return null
  }

  return url
}

function isLiteralIpAddress(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')
}

/**
 * URL.hostname wraps a literal IPv6 address in brackets (e.g. "[::1]"), but
 * DNS-resolved addresses from Deno.resolveDns come back bare (e.g. "::1") —
 * this function is called with both shapes, so every comparison below needs
 * the bracket-free, lowercased form or a bracketed literal like "[fe80::1]"
 * silently never matches any of the checks and sails through as "safe".
 */
function stripBrackets(host: string): string {
  const lower = host.toLowerCase()
  return lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower
}

function isPrivateOrReservedIp(rawHost: string): boolean {
  const host = stripBrackets(rawHost)

  // IPv4-mapped IPv6, either dotted-decimal (::ffff:169.254.169.254) or the
  // hex-group form the platform's URL/DNS implementations actually produce
  // (::ffff:a9fe:a9fe) — unwrap either to the embedded IPv4 address and
  // re-check that, so this can't be used to smuggle a private IPv4 target
  // past the IPv6-shaped checks below.
  const mappedDotted = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (mappedDotted) {
    return isPrivateOrReservedIp(mappedDotted[1])
  }
  const mappedHex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16)
    const lo = parseInt(mappedHex[2], 16)
    const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
    return isPrivateOrReservedIp(ipv4)
  }

  if (host === '::1' || host === '::') return true
  if (host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return true

  const parts = host.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }

  const [a, b] = parts
  if (a === 127) return true
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  if (a === 100 && b >= 64 && b <= 127) return true // carrier-grade NAT, RFC 6598
  if (a === 0) return true
  return false
}

/**
 * Fetches with the same SSRF guard applied to every hop, not just the
 * initial URL: a public URL that itself passes resolveSafeUrl could still
 * 3xx-redirect to an internal address (e.g. the cloud metadata endpoint),
 * and `redirect: 'follow'` would previously have followed it unchecked.
 * Manually walks the redirect chain instead, re-resolving and
 * re-validating each Location header before fetching it, capped at
 * MAX_REDIRECTS hops and a single overall deadline shared across every hop
 * (rather than a fresh per-hop timeout, which a long redirect chain could
 * otherwise use to multiply the effective time budget).
 */
async function fetchWithSsrfGuard(initialUrl: URL, timeoutMs: number): Promise<Response> {
  const deadline = Date.now() + timeoutMs
  let currentUrl = initialUrl

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      throw new Error(`Request timed out after ${timeoutMs}ms`)
    }

    const response = await fetchWithTimeout(
      currentUrl.toString(),
      {
        headers: {
          // A plain, honest identification — not spoofing a real browser to
          // get around bot detection. If a site blocks this, that's a
          // legitimate failure, not something to work around.
          'User-Agent': 'Mozilla/5.0 (compatible; MyRecruiterCheckBot/1.0; +https://myrecruitercheck.com)',
          Accept: 'text/html',
        },
        redirect: 'manual',
      },
      remaining,
    )

    const isRedirect = response.status >= 300 && response.status < 400
    const location = response.headers.get('location')

    if (!isRedirect || !location) {
      return response
    }

    // Body of a redirect response is never used — discard it so the
    // underlying connection can be released before the next hop.
    await response.body?.cancel()

    let nextUrl: URL
    try {
      nextUrl = new URL(location, currentUrl)
    } catch {
      throw new Error('Redirect target is not a valid URL')
    }

    const safeNextUrl = await resolveSafeUrl(nextUrl.toString())
    if (!safeNextUrl) {
      throw new Error('Redirect target rejected by SSRF guard')
    }

    currentUrl = safeNextUrl
  }

  throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`)
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Reads a response body up to maxBytes, throwing rather than silently
 * truncating — an oversized body is treated as an extraction failure, not
 * partially processed.
 */
async function readTextCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return await response.text()

  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error('Response body exceeded size limit')
    }
    chunks.push(value)
  }

  const buffer = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8').decode(buffer)
}

/**
 * Best-effort readable-text extraction: strips obvious noise (scripts,
 * nav/header/footer chrome, forms) and prefers a <main>/<article>/role=main
 * container if the page has one, falling back to the full body. This is
 * intentionally simple rather than a full Readability port — good enough for
 * "attempt to extract", with the required fallback message covering the
 * pages it doesn't handle well.
 */
function extractReadableText(html: string): string {
  const { document } = parseHTML(html)

  document
    .querySelectorAll('script, style, noscript, nav, header, footer, svg, iframe, form, button, aside')
    .forEach((el: { remove: () => void }) => el.remove())

  const preferred = document.querySelector('main, article, [role="main"]')
  const raw = (preferred?.textContent ?? document.body?.textContent ?? '') as string

  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_EXTRACTED_CHARS)
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
