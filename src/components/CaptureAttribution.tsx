import { useEffect } from 'react'
import { captureFirstTouch } from '@/lib/attribution'

/**
 * Records first-touch acquisition once per browser, on the first page the
 * visitor lands on.
 *
 * Runs in an effect rather than at module scope so it happens after hydration,
 * where window and document are real. It is intentionally not keyed to the
 * route: only the FIRST visit is recorded, and captureFirstTouch never
 * overwrites what is already stored, so running again on a later navigation is
 * a no-op.
 *
 * Renders nothing and cannot throw into the tree: every storage access inside
 * captureFirstTouch is wrapped, because localStorage throws outright in Safari
 * private mode and an attribution nicety must never break the page.
 */
export function CaptureAttribution() {
  useEffect(() => {
    captureFirstTouch()
  }, [])

  return null
}
