/**
 * The first focusable element on a page, letting a keyboard or screen reader
 * user jump past the header instead of tabbing through the nav on every page.
 *
 * Shared by the two layouts that own a `main` landmark, PublicLayout and
 * LegalLayout, rather than copied into each: the class string is long enough
 * that two copies would drift, and a skip link that stops matching its target
 * fails silently.
 *
 * Every visual class sits behind `focus:`, so the resting state is a pure
 * `sr-only` 1x1. Hoisting any of them to the base makes the hidden element
 * full sized: still invisible, because `clip` and `overflow` hide it, but not
 * what the markup then claims.
 */

/** The id the link targets, and the id its layout must put on `main`. */
export const MAIN_LANDMARK_ID = 'main-content'

const skipLinkClassName =
  'sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-text-primary focus:shadow focus:outline-none focus:ring-2 focus:ring-blue'

export function SkipLink() {
  return (
    <a href={`#${MAIN_LANDMARK_ID}`} className={skipLinkClassName}>
      Skip to content
    </a>
  )
}
