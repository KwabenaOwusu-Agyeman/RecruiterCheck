import type { NextConfig } from 'next'

// Static security headers. The Content-Security-Policy is NOT set here: it
// carries a per-request nonce and is therefore set in middleware.ts instead.
//
// This project is deployed separately from the public site, so none of the
// inline-script hashes pinned in the root vercel.json apply to it.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // The dashboard is private. Its vercel.app URL is publicly reachable, so
  // keeping it out of search indexes is hygiene, never a security control:
  // authorisation is enforced server-side on every request.
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // This app has its own package-lock.json inside a repo that has another at
  // the root. Without pinning the tracing root, Next infers the repo root and
  // traces the whole public app's dependency graph into this build.
  outputFileTracingRoot: __dirname,
  poweredByHeader: false,
  // Fail the production build on a type or lint error rather than shipping it.
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
