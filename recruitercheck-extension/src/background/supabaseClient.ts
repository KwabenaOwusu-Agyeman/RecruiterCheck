import { createClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config'
import { chromeStorageAdapter } from '@/background/storageAdapter'

// Deliberately its own session, independent of the web app's — no
// localStorage/cookie reads across origins, no shared state. This is the
// only Supabase client instance in the extension.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: chromeStorageAdapter,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

/**
 * Mirrors src/services/checkService.ts's resolveFunctionError in the main
 * web app: supabase-js throws a generic "Edge Function returned a non-2xx
 * status code" for any non-2xx response, discarding the specific message
 * our functions return in the body unless it's explicitly read back out of
 * error.context.
 */
export async function resolveFunctionError(error: unknown): Promise<Error> {
  const context = (error as { context?: unknown } | null)?.context
  if (context instanceof Response) {
    try {
      const body = (await context.clone().json()) as { error?: unknown }
      if (body?.error) return new Error(String(body.error))
    } catch {
      // Body wasn't JSON (or already consumed) — fall through.
    }
  }
  return error instanceof Error ? error : new Error('Something went wrong')
}
