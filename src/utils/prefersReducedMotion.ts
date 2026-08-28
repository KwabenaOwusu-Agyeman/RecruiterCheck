/**
 * Read once at call time rather than through a hook: this only decides
 * whether an auto-scroll starts, and re-running it on a media-query change
 * would restart the ticker mid-scroll.
 *
 * SSR-safe — the prerender pass has no window and falls through to
 * "animate", which is what hydration then agrees with.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
