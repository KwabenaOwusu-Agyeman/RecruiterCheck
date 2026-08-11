import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { trackEvent } from '@/lib/analytics'

export type AuthModalMode = 'sign-in' | 'sign-up'

interface AuthModalContextValue {
  mode: AuthModalMode | null
  open: (mode: AuthModalMode) => void
  close: () => void
  setMode: (mode: AuthModalMode) => void
}

const AuthModalContext = createContext<AuthModalContextValue | undefined>(undefined)

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AuthModalMode | null>(null)

  const open = useCallback((nextMode: AuthModalMode) => {
    if (nextMode === 'sign-up') trackEvent('signup_started')
    setMode(nextMode)
  }, [])
  const close = useCallback(() => setMode(null), [])

  const value = useMemo(() => ({ mode, open, close, setMode }), [mode, open, close])

  return <AuthModalContext.Provider value={value}>{children}</AuthModalContext.Provider>
}

export function useAuthModal() {
  const context = useContext(AuthModalContext)
  if (!context) {
    throw new Error('useAuthModal must be used within AuthModalProvider')
  }
  return context
}
