// Where to send the user after they finish signing in. Needed because the
// OAuth path does a full-page round trip through Supabase and back to
// /auth/callback — in-memory React state (e.g. AuthModalContext) doesn't
// survive that, so this has to be sessionStorage, not a variable.
const KEY = 'rc_post_auth_redirect'

export function storePostAuthRedirect(path: string): void {
  sessionStorage.setItem(KEY, path)
}

export function consumePostAuthRedirect(): string {
  const path = sessionStorage.getItem(KEY)
  sessionStorage.removeItem(KEY)
  // Only ever a same-origin relative path we wrote ourselves, but validated
  // anyway rather than trusting storage blindly.
  return path && path.startsWith('/') && !path.startsWith('//') ? path : '/checks'
}
