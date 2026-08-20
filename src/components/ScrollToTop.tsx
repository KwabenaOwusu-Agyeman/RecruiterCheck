import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * React Router doesn't reset scroll position on navigation the way a full
 * page load does — the window keeps whatever scrollY the previous page was
 * at. Without this, following a link from partway down a long page (e.g.
 * FeedbackPage) lands mid-scroll on the next page instead of at its top.
 */
export function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}
