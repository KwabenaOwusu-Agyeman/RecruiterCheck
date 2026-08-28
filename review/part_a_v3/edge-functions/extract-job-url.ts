import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { parseHTML } from 'npm:linkedom@0.16.11'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
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

// Guarded so importing this module for its exported pure functions (see
// extract-job-url.test.ts) never starts a listener -- in the real deployed
// Edge Function, this module IS the entry point, so import.meta.main is
// still true there and this behaves identically to an unguarded call.
if (import.meta.main) {
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

      const { data: rateLimitAllowed, error: rateLimitError } =
        await adminClient
          .rpc(
            'check_and_record_rate_limit',
            {
              p_user_id: user.id,
              p_bucket: RATE_LIMIT_BUCKET,
              p_limit: RATE_LIMIT_MAX,
              p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
            },
          )

      if (rateLimitError) {
        console.error(
          'extract-job-url: rate limit check failed',
          rateLimitError,
        )
        return jsonResponse({ error: COULD_NOT_READ_MESSAGE }, 500)
      }

      if (!rateLimitAllowed) {
        return jsonResponse({
          error: 'Too many requests. Please try again later.',
        }, 429)
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
        console.error('extract-job-url: non-2xx response', {
          status: response.status,
        })
        return jsonResponse({ error: COULD_NOT_READ_MESSAGE }, 422)
      }

      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('text/html')) {
        console.error('extract-job-url: unsupported content-type', {
          contentType,
        })
        return jsonResponse({ error: COULD_NOT_READ_MESSAGE }, 422)
      }

      let html: string
      try {
        html = await readTextCapped(response, MAX_RESPONSE_BYTES)
      } catch (error) {
        console.error(
          'extract-job-url: response body too large or unreadable',
          {
            message: error instanceof Error ? error.message : String(error),
          },
        )
        return jsonResponse({ error: COULD_NOT_READ_MESSAGE }, 422)
      }

      const text = extractReadableText(html)

      if (text.length < MIN_EXTRACTED_CHARS) {
        console.error('extract-job-url: extracted text too short', {
          length: text.length,
        })
        return jsonResponse({ error: COULD_NOT_READ_MESSAGE }, 422)
      }

      return jsonResponse({ jobDescription: text, text })
    } catch (error) {
      console.error('extract-job-url error:', error)
      return jsonResponse({ error: COULD_NOT_READ_MESSAGE }, 500)
    }
  })
}

/**
 * V3 fix (item 1/2 of the founder's approved corrections): reject any URL
 * carrying userinfo (user:pass@host) outright, before any hostname/IP
 * check runs. Credentials embedded in a URL are never a legitimate input
 * for a job-posting link and add an unnecessary confusion/leak surface.
 */
async function resolveSafeUrl(rawUrl: string): Promise<URL | null> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null // V3 fix: reject credentials-bearing URLs

  const hostname = url.hostname.toLowerCase()
  if (
    hostname === 'localhost' || hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  ) {
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
    if (
      records.length === 0 || records.some((ip) => isPrivateOrReservedIp(ip))
    ) {
      return null
    }
  } catch {
    return null
  }

  return url
}

function isLiteralIpAddress(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')
}

function stripBrackets(host: string): string {
  const lower = host.toLowerCase()
  return lower.startsWith('[') && lower.endsWith(']')
    ? lower.slice(1, -1)
    : lower
}

function isPrivateOrReservedIp(rawHost: string): boolean {
  const host = stripBrackets(rawHost)

  const mappedDotted = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (mappedDotted) {
    return isPrivateOrReservedIp(mappedDotted[1])
  }
  const mappedHex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16)
    const lo = parseInt(mappedHex[2], 16)
    const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${
      lo & 0xff
    }`
    return isPrivateOrReservedIp(ipv4)
  }

  if (host === '::1' || host === '::') return true
  if (
    host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')
  ) return true // link-local + unique-local

  const parts = host.split('.').map(Number)
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false
  }

  const [a, b] = parts
  if (a === 127) return true
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 0) return true
  if (a >= 224 && a <= 239) return true // V3 fix: 224.0.0.0/4 multicast
  if (a >= 240) return true // V3 fix: 240.0.0.0/4 reserved (incl. 255.255.255.255)
  return false
}

/**
 * DNS-rebinding TOCTOU: known, documented, accepted residual risk per the
 * founder's explicit decision. resolveSafeUrl's DNS resolution and this
 * function's own fetch() each perform an independent DNS lookup; a
 * malicious domain could theoretically swap records between the two.
 * Full elimination would require pinning to a resolved IP with a raw
 * socket connection and manual TLS SNI/Host override, which the Deno Edge
 * Functions fetch() API does not expose. Compensating controls kept
 * intact per the founder's decision: redirect re-validation on every hop,
 * protocol restriction, private/reserved IP blocking (now including
 * multicast/reserved ranges), a shared timeout budget across the whole
 * redirect chain, a hard response-size cap, and never logging the raw URL.
 */
async function fetchWithSsrfGuard(
  initialUrl: URL,
  timeoutMs: number,
): Promise<Response> {
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
          'User-Agent':
            'Mozilla/5.0 (compatible; MyRecruiterCheckBot/1.0; +https://myrecruitercheck.com)',
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

async function readTextCapped(
  response: Response,
  maxBytes: number,
): Promise<string> {
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

// linkedom's own type declarations (npm:linkedom@0.16.11) type parseHTML's
// return as `Window & typeof globalThis`, assuming a full lib.dom.d.ts
// `Window` is ambiently available -- Deno's own global type environment
// does not declare `document` on `Window`, so that annotation does not
// type-check here even though the runtime object genuinely has it. This
// local interface names only the members this function actually uses,
// avoiding the incompatible ambient type entirely.
interface MinimalDomElement {
  remove(): void
  textContent: string | null
}
interface MinimalParsedDocument {
  querySelectorAll(selector: string): Iterable<MinimalDomElement>
  querySelector(selector: string): MinimalDomElement | null
  body: MinimalDomElement | null
}

function extractReadableText(html: string): string {
  const { document } = parseHTML(html) as unknown as {
    document: MinimalParsedDocument
  }

  for (
    const el of document.querySelectorAll(
      'script, style, noscript, nav, header, footer, svg, iframe, form, button, aside',
    )
  ) {
    el.remove()
  }

  const preferred = document.querySelector('main, article, [role="main"]')
  const raw = preferred?.textContent ?? document.body?.textContent ?? ''

  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_EXTRACTED_CHARS)
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Exported for the accompanying Deno test file (extract-job-url.test.ts).
export { isPrivateOrReservedIp, resolveSafeUrl }
