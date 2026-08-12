import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { PageHeader } from '@/components/ui/Badge'
import { PRICING_PLANS } from '@/lib/constants'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { signOut } from '@/services/authService'
import {
  deleteAccount,
  FREE_TIER_LIFETIME_LIMIT,
  getSubscription,
  getTodaysCheckCount,
  PAID_TIER_DAILY_LIMIT,
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
  const [todaysCheckCount, setTodaysCheckCount] = useState<number | null>(null)
  const [freeCheckUsed, setFreeCheckUsed] = useState<boolean | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

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
      setTodaysCheckCount(null)
      setFreeCheckUsed(profile.lifetime_checks_consumed >= FREE_TIER_LIFETIME_LIMIT)
      return
    }

    setFreeCheckUsed(null)
    setTodaysCheckCount(getTodaysCheckCount(profile))

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

  useEffect(() => {
    if (!confirmingDelete) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setConfirmingDelete(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [confirmingDelete])

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
            <Button variant="secondary" size="sm" onClick={() => void signOut()}>
              Sign Out
            </Button>
          }
        />
      </div>

      <div className="grid items-stretch gap-3 lg:grid-cols-2">
        <Card className="flex h-full flex-col">
          <CardHeader className="py-2.5">
            <h2 className="text-base font-semibold text-text-primary">Profile</h2>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col py-3">
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

        <Card className="flex h-full flex-col">
          <CardHeader className="py-2.5">
            <h2 className="text-base font-semibold text-text-primary">Plan</h2>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-1.5 py-3 text-sm">
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
                  : `${todaysCheckCount ?? '...'} of ${PAID_TIER_DAILY_LIMIT} used today`}
              </span>
            </div>
            {!isFree ? (
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Resets</span>
                <span className="font-medium text-text-primary">Daily</span>
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
              <Button variant="secondary" size="sm" className="w-full">
                {isFree ? 'Upgrade' : 'Manage Billing'}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-3">
        <CardHeader className="py-2.5">
          <h2 className="text-base font-semibold text-text-primary">Danger Zone</h2>
        </CardHeader>
        <CardContent className="py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-text-secondary">
              Permanently delete your account and all associated data. This cannot be undone.
            </p>
            <Button
              size="sm"
              className="shrink-0 border-error bg-error text-white hover:bg-error/90"
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

      {confirmingDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#05050D]/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleting) setConfirmingDelete(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            className="w-full max-w-sm rounded-2xl border border-navy bg-surface p-[16px] shadow-lg sm:p-6"
          >
            <h2 id="delete-account-title" className="text-base font-semibold text-text-primary">
              Delete your account?
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              Your account, checks, uploaded CVs, generated documents, and associated data will be
              permanently deleted. This cannot be undone.
            </p>
            <div className="mt-[16px] flex justify-end gap-3 sm:mt-6">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={deleting}
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={deleting}
                onClick={() => void handleConfirmDeleteAccount()}
                className="!border-error bg-error hover:!bg-error/90"
              >
                {deleting ? 'Deleting...' : 'Delete Account'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <nav className="mt-3 flex justify-center gap-4 text-xs text-text-secondary" aria-label="Legal">
        <Link to="/terms" className="transition-colors hover:text-text-primary">
          Terms of Service
        </Link>
        <Link to="/privacy" className="transition-colors hover:text-text-primary">
          Privacy Policy
        </Link>
        <Link to="/disclaimer" className="transition-colors hover:text-text-primary">
          Disclaimer
        </Link>
      </nav>
    </>
  )
}
