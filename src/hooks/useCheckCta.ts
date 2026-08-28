import { useNavigate } from 'react-router-dom'
import { useAuthModal } from '@/features/auth/context/AuthModalContext'
import { storePostAuthRedirect } from '@/features/auth/postAuthRedirect'
import { useAuth } from '@/hooks/useAuth'

/**
 * Shared "Check" CTA behavior used by the sticky mobile bar, the landing
 * page, and the Example Recruiter Check page: signed-in visitors go
 * straight to a new check, signed-out visitors get the existing sign-up
 * flow. Centralized so the branch isn't re-implemented at each call site.
 */
export function useCheckCta() {
  const { user } = useAuth()
  const { open } = useAuthModal()
  const navigate = useNavigate()

  // Typed `unknown` rather than `{ role?: string }`, because most call sites
  // pass this function straight to onClick — where React hands it a
  // MouseEvent as the first argument (and a narrower parameter type would
  // reject the assignment). The runtime narrowing below means an event
  // object simply degrades to the plain, role-less navigation, while the
  // hero calls it as handleCheckCta({ role }) to carry the picked role.
  return function handleCheckCta(options?: unknown) {
    const role =
      options && typeof options === 'object' && 'role' in options && typeof (options as { role?: unknown }).role === 'string'
        ? (options as { role: string }).role
        : undefined
    const target = role ? `/checks/new?role=${encodeURIComponent(role)}` : '/checks/new'
    if (user) {
      navigate(target)
    } else {
      // Without this, a signed-out visitor who signs up from this button
      // lands on the generic /checks default after auth instead of actually
      // starting the check they clicked through for.
      storePostAuthRedirect(target)
      open('sign-up')
    }
  }
}
