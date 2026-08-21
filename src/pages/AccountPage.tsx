import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { PageHeader } from '@/components/ui/Badge'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { PRICING_PLANS } from '@/lib/constants'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { signOut, updatePassword } from '@/services/authService'
import {
  deleteAccount,
  FREE_TIER_LIFETIME_LIMIT,
  getSubscription,
  updateProfile,
} from '@/services/checkService'
import type { Subscription } from '@/types'

function formatPlanLabel(tier: string): string {
  return PRICING_PLANS.find((plan) => plan.id === tier)?.name ?? 'Free'
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

export function AccountPage() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [freeCheckUsed, setFreeCheckUsed] = useState<boolean | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  useEffect(() => {
    setFullName(profile?.full_name ?? '')
  }, [profile?.full_name])

  // Usage counts read straight off the profile's durable counters (see
  // migration durable_usage_counters) rather than counting `checks` rows —
  // counting rows would let a deleted completed check make this page show
  // "free check available" when the server would still reject a new one.
  useEffect(() => {
    if (!user || !profile) return

    if (profile.subscription_tier === 'free') {
      setSubscription(null)
      setFreeCheckUsed(profile.lifetime_checks_consumed >= FREE_TIER_LIFETIME_LIMIT)
      return
    }

    setFreeCheckUsed(null)

    let cancelled = false
    void getSubscription(user.id).then((data) => {
      if (!cancelled) setSubscription(data)
    })
    return () => {
      cancelled = true
    }
  }, [user, profile])

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    if (!user) return

    setSaving(true)
    setMessage(null)
    setError(null)

    try {
      await updateProfile(user.id, { full_name: fullName.trim() || null })
      await refreshProfile()
      setMessage('Account updated.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update account')
    } finally {
      setSaving(false)
    }
  }

  async function handlePasswordChange(event: FormEvent) {
    event.preventDefault()
    setPasswordMessage(null)
    setPasswordError(null)

    if (newPassword !== confirmNewPassword) {
      setPasswordError('Passwords do not match.')
      return
    }

    setChangingPassword(true)
    try {
      await updatePassword(newPassword)
      setNewPassword('')
      setConfirmNewPassword('')
      setPasswordMessage('Password updated.')
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Could not update password')
    } finally {
      setChangingPassword(false)
    }
  }

  async function handleConfirmDeleteAccount() {
    setDeleting(true)
    setDeleteError(null)

    try {
      await deleteAccount()
      await supabase.auth.signOut()
      navigate('/', { replace: true })
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete account')
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  const passwordMismatch = confirmNewPassword.length > 0 && newPassword !== confirmNewPassword
  const isFree = (profile?.subscription_tier ?? 'free') === 'free'
  const planDateLabel = subscription?.current_period_end
    ? `Renews ${formatDate(subscription.current_period_end)}`
    : subscription?.created_at
      ? `Started ${formatDate(subscription.created_at)}`
      : null

  return (
    <>
      <BackLink to="/checks" />
      <div className="mt-3">
        <PageHeader
          title="Account"
          description="Manage your profile and subscription settings."
          action={
            <Button
              variant="secondary"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => void signOut()}
            >
              Sign Out
            </Button>
          }
        />
      </div>

      <div className="grid items-stretch gap-3 sm:gap-4 lg:grid-cols-2 lg:gap-[24px]">
        <Card className="flex h-full flex-col">
          <CardHeader className="py-2.5 sm:py-4">
            <h2 className="font-display text-lg font-semibold text-text-primary sm:text-xl">Profile</h2>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col py-3 sm:py-5">
            <form
              onSubmit={(event) => void handleSave(event)}
              className="flex flex-1 flex-col space-y-2"
            >
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={user?.email ?? ''} disabled />
              </div>

              <div className="space-y-1">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Your name"
                />
              </div>

              {message ? <Alert variant="success">{message}</Alert> : null}
              {error ? <Alert variant="error">{error}</Alert> : null}

              <div className="flex-1" />

              <Button type="submit" size="sm" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card tone="light-elevated" className="flex h-full flex-col">
          <CardHeader className="py-2.5 sm:py-4">
            <h2 className="font-display text-lg font-semibold text-text-primary sm:text-xl">Plan</h2>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-1.5 py-3 text-sm sm:space-y-2.5 sm:py-5">
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Current plan</span>
              <span className="font-medium text-text-primary">
                {formatPlanLabel(profile?.subscription_tier ?? 'free')}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Recruiter Checks</span>
              <span className="font-medium text-text-primary">
                {isFree
                  ? freeCheckUsed === null
                    ? '...'
                    : freeCheckUsed
                      ? `${FREE_TIER_LIFETIME_LIMIT} of ${FREE_TIER_LIFETIME_LIMIT} used`
                      : `${FREE_TIER_LIFETIME_LIMIT} total`
                  : profile
                    ? `${profile.period_checks_consumed} of ${profile.period_checks_limit} used this week`
                    : '...'}
              </span>
            </div>
            {!isFree ? (
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Resets</span>
                <span className="font-medium text-text-primary">Weekly</span>
              </div>
            ) : null}
            {planDateLabel ? (
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">
                  {subscription?.current_period_end ? 'Next billing date' : 'Member since'}
                </span>
                <span className="font-medium text-text-primary">{planDateLabel}</span>
              </div>
            ) : null}

            <div className="flex-1" />

            <Link to="/account/billing">
              <Button size="sm" className="w-full">
                {isFree ? 'Upgrade' : 'Manage Billing'}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Only shown for users who actually have a password to change —
          signInWithOAuth (Google/LinkedIn) accounts never set one, and
          offering to "update" a password they don't have either fails or
          confusingly grants them a new, unrequested sign-in method. */}
      {user?.app_metadata.provider === 'email' ? (
        <Card className="mt-3 sm:mt-6">
          <CardHeader className="py-2.5 sm:py-4">
            <h2 className="font-display text-lg font-semibold text-text-primary sm:text-xl">Password</h2>
          </CardHeader>
          <CardContent className="py-3 sm:py-5">
            <form
              onSubmit={(event) => void handlePasswordChange(event)}
              className="grid gap-3 sm:max-w-sm"
            >
              <div className="space-y-1">
                <Label htmlFor="newPassword">New password</Label>
                <PasswordInput
                  id="newPassword"
                  autoComplete="new-password"
                  minLength={6}
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="confirmNewPassword">Confirm new password</Label>
                <PasswordInput
                  id="confirmNewPassword"
                  autoComplete="new-password"
                  minLength={6}
                  placeholder="••••••••"
                  value={confirmNewPassword}
                  onChange={(event) => setConfirmNewPassword(event.target.value)}
                  aria-invalid={passwordMismatch}
                />
                {passwordMismatch ? <p className="text-xs text-error">Passwords do not match.</p> : null}
              </div>

              {passwordMessage ? <Alert variant="success">{passwordMessage}</Alert> : null}
              {passwordError ? <Alert variant="error">{passwordError}</Alert> : null}

              <Button
                type="submit"
                size="sm"
                className="w-full sm:w-auto"
                disabled={
                  changingPassword || !newPassword || !confirmNewPassword || passwordMismatch
                }
              >
                {changingPassword ? 'Updating...' : 'Update Password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-3 border-error/25 sm:mt-6 sm:border-error/20 sm:bg-[#FCEFEF]/30 sm:shadow-none">
        <CardHeader className="border-b-error/10 py-2.5 sm:py-4">
          <h2 className="font-display text-lg font-semibold text-text-primary sm:text-xl">Danger Zone</h2>
        </CardHeader>
        <CardContent className="py-3 sm:py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-text-secondary">
              Permanently delete your account and all associated data. This cannot be undone.
            </p>
            <Button
              size="sm"
              className="shrink-0 !border-error !bg-error text-white hover:!bg-error/90"
              disabled={deleting}
              onClick={() => setConfirmingDelete(true)}
            >
              {deleting ? 'Deleting...' : 'Delete Account'}
            </Button>
          </div>
          {deleteError ? (
            <Alert variant="error" className="mt-3">
              {deleteError}
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete your account?"
        description="Your account, checks, uploaded CVs, generated documents, and associated data will be permanently deleted. This cannot be undone."
        confirmLabel="Delete Account"
        confirmingLabel="Deleting..."
        busy={deleting}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => void handleConfirmDeleteAccount()}
      />

      <nav className="mt-3 flex justify-center gap-4 text-xs text-text-secondary" aria-label="Legal">
        <Link to="/terms" className="transition-colors hover:text-text-primary">
          Terms of Service
        </Link>
        <Link to="/privacy" className="transition-colors hover:text-text-primary">
          Privacy Policy
        </Link>
        <Link to="/cookies" className="transition-colors hover:text-text-primary">
          Cookie Policy
        </Link>
        <Link to="/disclaimer" className="transition-colors hover:text-text-primary">
          Disclaimer
        </Link>
      </nav>
    </>
  )
}
