import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { env } from './env'
import type { Database } from '@/types/db'

export type Db = SupabaseClient<Database>

/**
 * Service-role client. Bypasses RLS entirely, so every call site is
 * responsible for scoping its own query. Only ever reached after
 * requireAdmin() has allowed the request.
 *
 * A fresh client per call rather than a module singleton: a singleton in a
 * serverless runtime can outlive the request that created it and be reused
 * across invocations belonging to different users, which is the kind of
 * cross-request bleed a dashboard over customer data must not risk.
 */
export function serviceClient(): Db {
  return createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application-name': 'myrecruitercheck-admin' } },
  })
}

/**
 * Request-scoped client carrying the caller's own session cookies. Used only
 * to establish WHO the caller is; it never reads business data, because an
 * admin's own RLS grants are those of an ordinary customer.
 */
export async function sessionClient(): Promise<Db> {
  const cookieStore = await cookies()
  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component, where the cookie store is
          // read-only. Middleware refreshes the session, so this is safe.
        }
      },
    },
  })
}
