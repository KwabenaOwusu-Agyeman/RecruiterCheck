import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { parseHTML } from 'npm:linkedom@0.16.11'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FETCH_TIMEOUT_MS = 10000
const MAX_RESPONSE_BYTES = 3 * 1024 * 1024
const MAX_EXTRACTED_CHARS = 15000
const MIN_EXTRACTED_CHARS = 100
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
      response = await fetchWithTimeout(
        safeUrl.toString(),
        {
          // A plain, honest identification — not spoofing a real browser to
          // get around bot detection. If a site blocks this, that's a
          // legitimate failure, not something to work around.
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; RecruiterCheckBot/1.0; +https://recruitercheck.vercel.app)',
            Accept: 'text/html',
          },
          redirect: 'follow',
        },
        FETCH_TIMEOUT_MS,
      )
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
 * URL server-side. This is a reasonable baseline, not exhaustive protection
 * against every DNS-rebinding technique.
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
    const records = await Deno.resolveDns(hostname, 'A')
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

function isPrivateOrReservedIp(host: string): boolean {
  if (host === '::1') return true
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
  if (a === 0) return true
  return false
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
