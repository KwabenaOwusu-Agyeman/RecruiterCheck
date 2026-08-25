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

  return function handleCheckCta() {
    if (user) {
      navigate('/checks/new')
    } else {
      // Without this, a signed-out visitor who signs up from this button
      // lands on the generic /checks default after auth instead of actually
      // starting the check they clicked through for.
      storePostAuthRedirect('/checks/new')
      open('sign-up')
    }
  }
}
