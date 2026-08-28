import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { getProfile } from '@/services/checkService'
import { triggerWelcomeEmailOnce } from '@/services/welcomeEmailService'
import type { Profile } from '@/types'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<void>
  setSessionImmediate: (session: Session) => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  // Two callers race on every single page load: init() below, and the
  // INITIAL_SESSION event that onAuthStateChange fires immediately after.
  // Both used to issue their own identical request — confirmed in
  // production, where two /rest/v1/profiles calls started 1ms apart on
  // every load. Concurrent loads for the same user now share one request.
  // A later call (e.g. refreshProfile after a purchase) finds nothing in
  // flight and fetches normally, so this never serves a stale profile.
  const inFlightProfile = useRef<{ userId: string; promise: Promise<void> } | null>(null)

  const loadProfile = useCallback(async (userId: string) => {
    const existing = inFlightProfile.current
    if (existing?.userId === userId) return existing.promise

    const promise = (async () => {
      try {
        const nextProfile = await getProfile(userId)
        setProfile(nextProfile)
      } finally {
        if (inFlightProfile.current?.userId === userId) inFlightProfile.current = null
      }
    })()

    inFlightProfile.current = { userId, promise }
    return promise
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!session?.user.id) return
    await loadProfile(session.user.id)
  }, [loadProfile, session?.user.id])

  // Called right after a successful email/password sign-in or sign-up, so
  // ProtectedRoute sees the new session on its very next render instead of
  // waiting for the separate async onAuthStateChange listener below to fire
  // on its own schedule — that race is what was bouncing a just-logged-in
  // user back to /sign-in before their session had "arrived" in context.
  const setSessionImmediate = useCallback(
    (nextSession: Session) => {
      setSession(nextSession)
      setLoading(false)
      void loadProfile(nextSession.user.id)
      triggerWelcomeEmailOnce(nextSession.user.id)
    },
    [loadProfile],
  )

  useEffect(() => {
    let mounted = true

    async function init() {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return

      setSession(data.session)

      if (data.session?.user.id) {
        // Deliberately not awaited. ProtectedRoute gates on `session`, not
        // `profile`, so blocking here put a whole extra round trip in front
        // of the app's first paint for every protected page. Pages that
        // genuinely need the profile (e.g. NewCheckPage's plan gate) already
        // wait for it themselves, and every profile consumer handles null.
        void loadProfile(data.session.user.id)
        // Opportunistic retry on every session restore (e.g. reopening the
        // app), not just fresh sign-in/verification — the edge function's
        // own idempotent claim makes this a cheap no-op once already sent.
        triggerWelcomeEmailOnce(data.session.user.id)
      }

      setLoading(false)
    }

    void init()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      // A PASSWORD_RECOVERY session lets the user call updateUser() to set a
      // new password — it must not grant access to the rest of the app via
      // ProtectedRoute before they've actually done that. ResetPasswordPage
      // has its own listener to pick this session up for that one purpose.
      if (event === 'PASSWORD_RECOVERY') return

      setSession(nextSession)

      if (nextSession?.user.id) {
        // Not awaited, for the same reason as init() above.
        void loadProfile(nextSession.user.id)
        triggerWelcomeEmailOnce(nextSession.user.id)
      } else {
        setProfile(null)
      }

      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      refreshProfile,
      setSessionImmediate,
    }),
    [session, profile, loading, refreshProfile, setSessionImmediate],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
