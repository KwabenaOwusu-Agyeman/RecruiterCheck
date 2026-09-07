// Constrains a caller-supplied redirect target to a path on this origin.
//
// Both auth routes take a `next` parameter from an unauthenticated URL and
// redirect to it after establishing a session. Without this, either endpoint is
// an open redirect: an attacker sends a link that signs the victim in and then
// bounces them to a page under the attacker's control, carrying the session in
// the referrer and putting a convincing login flow in front of them.
//
// Extracted so the two routes cannot drift apart. A rule enforced in one place
// and forgotten in the other is the usual way this reappears.
//
// The rule is allowlist-shaped rather than denylist-shaped: a target must look
// like a same-origin absolute path, rather than merely not looking like the
// attacks that came to mind today.

/** Where a caller lands when the requested target is absent or unacceptable. */
export const DEFAULT_REDIRECT = '/'

/**
 * Characters a browser strips or normalises while parsing a URL, which makes
 * the string a reviewer reads different from the one the browser resolves.
 * "/\thttps://evil.test" is the shape this catches.
 *
 * Applied to the RAW input only. Once a value has been percent-decoded these
 * characters are ordinary data: "/users?q=a%20b" decodes to a string containing
 * a space and is a perfectly normal link.
 */
const STRIPPABLE = /[\u0000-\u0020\u007F]/

/**
 * Whether a string is shaped like a path on this origin.
 *
 * Applied to the raw input AND to its decoded form, because percent-encoding
 * hides every one of these: "/%2F%2Fevil.test" and "/%5Cevil.test" both pass
 * these checks as written and fail them once decoded.
 */
function looksLikeSameOriginPath(value: string): boolean {
  // Must be an absolute path.
  if (!value.startsWith('/')) return false

  // "//evil.test" and "/\evil.test" are protocol-relative: they leave this
  // origin despite starting with a slash. A browser reads a backslash as a
  // forward slash in the authority position, so both shapes go.
  if (value.startsWith('//') || value.startsWith('/\\')) return false

  // A backslash anywhere else can still be normalised into a slash, so it is
  // refused rather than reasoned about case by case.
  if (value.includes('\\')) return false

  return true
}

export function safeRedirectTarget(requested: string | null | undefined): string {
  if (typeof requested !== 'string' || requested.length === 0) return DEFAULT_REDIRECT

  if (STRIPPABLE.test(requested)) return DEFAULT_REDIRECT
  if (!looksLikeSameOriginPath(requested)) return DEFAULT_REDIRECT

  let decoded: string
  try {
    decoded = decodeURIComponent(requested)
  } catch {
    // A malformed escape sequence is not something to guess at.
    return DEFAULT_REDIRECT
  }

  // Only the structural rule is re-applied to the decoded form. Re-applying
  // STRIPPABLE here would reject "/users?q=a%20b", an ordinary link, for
  // containing an encoded space.
  if (!looksLikeSameOriginPath(decoded)) return DEFAULT_REDIRECT

  return requested
}
