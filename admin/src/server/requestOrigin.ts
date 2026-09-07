import 'server-only'
import { headers } from 'next/headers'

// The origin the current request arrived on.
//
// Built from the request rather than hardcoded or read from an environment
// variable, so the same code works on localhost:3001, on a Vercel preview and
// on the production alias without three configurations to keep in step. Both
// auth flows hand this origin to Supabase as a return address, and a wrong one
// sends the user somewhere else entirely.
//
// Note that whichever origin this produces must also be listed under
// Authentication > URL Configuration in the Supabase dashboard. Supabase
// silently falls back to site_url for an unlisted redirect target, which is how
// a working-looking sign-in ends up on the public marketing site.

export async function requestOrigin(): Promise<string> {
  const headerList = await headers()

  // x-forwarded-* is what a proxy sets; Vercel always does. The plain host
  // header is the local-development case.
  const host =
    headerList.get('x-forwarded-host') ?? headerList.get('host') ?? 'localhost:3001'

  // Trust the forwarded protocol where present, and otherwise infer: anything
  // that is not localhost is reached over https in this deployment.
  const forwardedProto = headerList.get('x-forwarded-proto')
  const proto = forwardedProto ?? (host.startsWith('localhost') ? 'http' : 'https')

  // A comma-separated list appears when a request passes through more than one
  // proxy; the first entry is the original.
  const firstHost = host.split(',')[0].trim()
  const firstProto = proto.split(',')[0].trim()

  return `${firstProto}://${firstHost}`
}
