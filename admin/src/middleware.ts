import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Middleware does two jobs, and deliberately not a third.
//
// 1. Refreshes the Supabase session cookie so a signed-in admin is not logged
//    out mid-session by an expired access token.
// 2. Bounces obviously-unauthenticated requests to /login, so the app does not
//    render a shell for someone with no session at all.
//
// It does NOT authorise. Middleware runs on the edge without the service role
// key, so it cannot read the admin_users allowlist, and treating "has a
// session" as "is an admin" would let any customer through. Authorisation is
// requireAdmin(), which runs server-side on every page and route handler.
// Middleware is a convenience and a session refresher, never the gate.

const PUBLIC_PATHS = ['/login', '/auth']

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // strict-dynamic lets Next's own bundles load off the nonced bootstrap
    // script without listing every hash. No 'unsafe-inline' for scripts.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Tailwind is compiled to a stylesheet, but Next injects a small amount of
    // inline style for streaming, so style-src needs the nonce too.
    `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com`,
    'font-src \'self\' https://fonts.gstatic.com',
    "img-src 'self' data:",
    // The Supabase project only. No third-party analytics, no ad network.
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
}

export async function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', buildCsp(nonce))

  let response = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request: { headers: requestHeaders } })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // getUser rather than getSession: it revalidates the token with the auth
  // server instead of trusting whatever the cookie claims.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  response.headers.set('content-security-policy', buildCsp(nonce))
  return response
}

export const config = {
  matcher: [
    // Everything except static assets and the favicon.
    '/((?!_next/static|_next/image|favicon.ico|robots.txt).*)',
  ],
}
