// Client-safe test-account check for UI-only exclusions (e.g. not showing
// the Trustpilot prompt to internal test accounts). This is not a security
// boundary — VITE_TEST_ACCOUNT_EMAILS is bundled into the public app, so it
// must never be used to gate anything sensitive. The actual Trustpilot AFS
// email send is gated server-side by the separate TEST_ACCOUNT_EMAILS
// Supabase secret (see supabase/functions/analyze-check/trustpilot-email.ts).
export function isTestAccountEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const listEnv = import.meta.env.VITE_TEST_ACCOUNT_EMAILS as string | undefined
  if (!listEnv) return false
  const normalized = email.trim().toLowerCase()
  return listEnv
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalized)
}
