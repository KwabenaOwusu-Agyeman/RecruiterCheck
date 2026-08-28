/**
 * True when the viewport is at or above Tailwind's `sm` breakpoint.
 *
 * Read once at call time, the same way `prefersReducedMotion` is: it only
 * decides whether a marquee's auto-scroll engine starts, and re-running it
 * on every resize would restart the ticker mid-scroll. iOS fires a resize
 * on every address-bar collapse, so a hook here would re-init Embla
 * repeatedly while the user is scrolling.
 *
 * SSR-safe — the prerender pass has no window and falls through to
 * "desktop", which matches the markup hydration then agrees with.
 */
export function isDesktopViewport(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true
  return window.matchMedia('(min-width: 640px)').matches
}
