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
import { useAuth } from '@/hooks/useAuth'
import { usePageMeta } from '@/hooks/usePageMeta'
import { supabase } from '@/lib/supabase'
import { signOut, updatePassword } from '@/services/authService'
import {
  deleteAccount,
  FREE_TIER_LIFETIME_LIMIT,
  getNearestBatchExpiry,
  updateProfile,
} from '@/services/checkService'

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

export function AccountPage() {
  usePageMeta({ title: 'Account | MyRecruiterCheck', description: 'Manage your MyRecruiterCheck account.', path: '/account', noindex: true })
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nearestExpiry, setNearestExpiry] = useState<string | null>(null)
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
  // migration durable_usage_counters/check_pack_system) rather than counting
  // `checks` rows — counting rows would let a deleted completed check make
  // this page show "free check available" when the server would still
  // reject a new one.
  useEffect(() => {
    if (!user || !profile) return

    setFreeCheckUsed(profile.lifetime_checks_consumed >= FREE_TIER_LIFETIME_LIMIT)

    let cancelled = false
    void getNearestBatchExpiry(user.id).then((expiresAt) => {
      if (!cancelled) setNearestExpiry(expiresAt)
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
  const hasBalance = (profile?.checks_balance ?? 0) > 0

  return (
    <>
      <BackLink to="/checks" />
      <div className="mt-3">
        <PageHeader
          title="Account"
          description="Manage your profile and billing settings."
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

      <div className="grid items-stretch gap-4 sm:gap-6 lg:grid-cols-2 lg:gap-[32px]">
        <Card className="flex h-full flex-col">
          <CardHeader className="py-3.5 sm:py-5">
            <h2 className="text-lg font-semibold text-text-primary sm:text-xl">Profile</h2>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col py-4 sm:py-6">
            <form
              onSubmit={(event) => void handleSave(event)}
              className="flex flex-1 flex-col space-y-3"
            >
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={user?.email ?? ''} disabled />
              </div>

              <div className="space-y-1.5">
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

        <Card tone="light" className="flex h-full flex-col">
          <CardHeader className="py-3.5 sm:py-5">
            <h2 className="text-lg font-semibold text-text-primary sm:text-xl">Checks</h2>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-2 py-4 text-sm sm:space-y-3 sm:py-6">
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Free Recruiter Check</span>
              <span className="font-medium text-text-primary">
                {freeCheckUsed === null
                  ? '...'
                  : freeCheckUsed
                    ? `${FREE_TIER_LIFETIME_LIMIT} of ${FREE_TIER_LIFETIME_LIMIT} used`
                    : `${FREE_TIER_LIFETIME_LIMIT} available`}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Purchased checks</span>
              <span className="font-medium text-text-primary">
                {profile ? `${profile.checks_balance} remaining` : '...'}
              </span>
            </div>
            {hasBalance && nearestExpiry ? (
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Next expiry</span>
                <span className="font-medium text-text-primary">{formatDate(nearestExpiry)}</span>
              </div>
            ) : null}

            <div className="flex-1" />

            <Link to="/pricing">
              <Button size="sm" className="w-full">
                {hasBalance ? 'Buy more checks' : 'Get checks'}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4 sm:mt-8">
        <CardHeader className="flex-row items-center justify-between gap-3 py-3.5 sm:py-5">
          <h2 className="text-lg font-semibold text-text-primary sm:text-xl">Browser extension</h2>
          <span className="shrink-0 rounded-full bg-navy-tint px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue">
            Early access
          </span>
        </CardHeader>
        <CardContent className="py-4 sm:py-6">
          <p className="text-sm text-text-secondary">
            Capture a job posting from LinkedIn, Indeed, or almost any careers page in one click,
            and send it straight into a new Recruiter Check, no copy-pasting. Not yet on the Chrome
            Web Store, so it's a manual install for now:
          </p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-text-secondary">
            <li>Download and unzip the extension below.</li>
            <li>
              In Chrome, open <code className="rounded bg-background px-1 py-0.5 text-xs">chrome://extensions</code>,
              turn on Developer mode, and click Load unpacked.
            </li>
            <li>Select the unzipped folder, then open the job posting you want to check and click the extension icon.</li>
            <li>Press Connect MyRecruiterCheck once, using this same account, and you're set.</li>
          </ol>
          <a
            href="/downloads/recruitercheck-extension-v0.1.0.zip"
            download
            className="mt-4 inline-flex"
          >
            <Button size="sm" variant="secondary">
              Download extension (.zip)
            </Button>
          </a>
        </CardContent>
      </Card>

      {/* Only shown for users who actually have a password to change —
          signInWithOAuth (Google/LinkedIn) accounts never set one, and
          offering to "update" a password they don't have either fails or
          confusingly grants them a new, unrequested sign-in method. */}
      {user?.app_metadata.provider === 'email' ? (
        <Card className="mt-4 sm:mt-8">
          <CardHeader className="py-3.5 sm:py-5">
            <h2 className="text-lg font-semibold text-text-primary sm:text-xl">Password</h2>
          </CardHeader>
          <CardContent className="py-4 sm:py-6">
            <form
              onSubmit={(event) => void handlePasswordChange(event)}
              className="grid gap-4 sm:max-w-sm"
            >
              <div className="space-y-1.5">
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
              <div className="space-y-1.5">
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

      <Card className="mt-4 border-error/25 sm:mt-8 sm:border-error/20 sm:bg-error/5 sm:shadow-none">
        <CardHeader className="border-b-error/10 py-3.5 sm:py-5">
          <h2 className="text-lg font-semibold text-text-primary sm:text-xl">Danger Zone</h2>
        </CardHeader>
        <CardContent className="py-4 sm:py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-text-secondary">
              Permanently delete your account and all associated data. This cannot be undone.
            </p>
            <Button
              size="sm"
              variant="danger"
              className="shrink-0"
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
