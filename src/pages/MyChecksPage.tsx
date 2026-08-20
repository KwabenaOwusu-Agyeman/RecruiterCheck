import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { ScoreBadge, StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PageHeader } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { deleteCheck, getCheckCount, getChecks } from '@/services/checkService'
import type { Check } from '@/types'

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function checkActionHref(check: Check): string {
  return check.status === 'draft' ? `/checks/${check.id}/edit` : `/checks/${check.id}`
}

function checkActionLabel(check: Check): string {
  return check.status === 'draft' ? 'Continue' : 'View'
}

export function MyChecksPage() {
  const { user, profile } = useAuth()
  const [checks, setChecks] = useState<Check[]>([])
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Check | null>(null)

  // Below Power, RLS itself only returns the single most recent check row
  // (see migration enforce_check_history_tier_at_rls) — `checks` is already
  // the entitled set, nothing to slice client-side. totalCount comes from a
  // separate count-only RPC so the "N earlier checks are locked" message
  // stays accurate without needing the (deliberately hidden) row content.
  // Defensive: RLS already gives Power users every row (lockedCount === 0),
  // but never show the upgrade banner to a Power subscriber even if
  // totalCount/checks briefly disagree while a tier change is in flight.
  const isPower = profile?.subscription_tier === 'power'
  const lockedCount = totalCount !== null ? totalCount - checks.length : 0

  useEffect(() => {
    if (!user) return
    void loadChecks(user.id)
  }, [user])

  async function loadChecks(userId: string) {
    try {
      const [data, count] = await Promise.all([getChecks(userId), getCheckCount(userId)])
      setChecks(data)
      setTotalCount(count)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load checks')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete || !user) return
    const checkId = pendingDelete.id

    setDeletingId(checkId)
    setError(null)

    try {
      await deleteCheck(checkId)
      // Re-fetch rather than splicing the deleted row out of local state:
      // below Power, deleting the currently-visible (most recent) check
      // means RLS will now surface a different row as "most recent" —
      // only a fresh query picks that up correctly.
      await loadChecks(user.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this check')
    } finally {
      setDeletingId(null)
      setPendingDelete(null)
    }
  }

  return (
    <>
      <PageHeader
        title="My Checks"
        description="View your checks, scores, and feedback in one place."
        action={
          // Hidden from sm+ — AppHeader's own New Check button covers that
          // range, and stacking both right on top of each other read as a
          // duplicate CTA. Below sm, AppHeader's nav (including its New
          // Check button) is hidden entirely, so this is the only one there.
          <Link to="/checks/new" className="block w-full sm:hidden">
            <Button size="sm" className="w-full">
              New Check
            </Button>
          </Link>
        }
      />

      <div className="rounded-[20px] border border-white/20 bg-navy p-3 shadow-glow sm:p-4">
        {loading ? (
          <div className="divide-y divide-white/10">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="flex items-center justify-between gap-3 px-3 py-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3 bg-white/10" />
                  <Skeleton className="h-3 w-1/4 bg-white/10" />
                </div>
                <Skeleton className="h-4 w-10 shrink-0 bg-white/10" />
              </div>
            ))}
          </div>
        ) : error ? (
          <Alert variant="error">{error}</Alert>
        ) : checks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[16px] border border-dashed border-white/25 px-6 py-16 text-center sm:py-20">
            <h2 className="text-base font-semibold text-white">No checks yet</h2>
            <p className="mt-2 max-w-sm text-sm text-white/75">
              Add a job and your CV to see your application from a recruiter's perspective.
            </p>
            <div className="mt-6">
              <Link to="/checks/new">
                <Button variant="accent" size="sm">New Check</Button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-[16px] md:block">
              <table className="min-w-full divide-y divide-white/10">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-white/70 lg:px-6">
                      Role
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-white/70">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-white/70">
                      Score
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-white/70">
                      Date
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-white/70 lg:px-6">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {checks.map((check) => (
                    <tr key={check.id} className="transition-colors duration-150 hover:bg-white/[0.04]">
                      <td className="px-4 py-4 lg:px-6 lg:py-5">
                        <div className="text-sm font-medium text-white">
                          {check.job_title || 'Untitled role'}
                        </div>
                        {check.company_name ? (
                          <div className="text-sm text-white/70">{check.company_name}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 lg:py-5">
                        <StatusBadge status={check.status} tone="dark" />
                      </td>
                      <td className="px-4 py-4 lg:py-5">
                        <ScoreBadge score={check.interview_probability_score} tone="dark" />
                      </td>
                      <td className="px-4 py-4 text-sm text-white/70 lg:py-5">
                        {formatDate(check.created_at)}
                      </td>
                      <td className="px-4 py-4 lg:px-6 lg:py-5">
                        <div className="flex items-center justify-end gap-4">
                          <Link
                            to={checkActionHref(check)}
                            className="text-sm font-semibold text-blue-light hover:underline"
                          >
                            {checkActionLabel(check)}
                          </Link>
                          <button
                            type="button"
                            disabled={deletingId === check.id}
                            onClick={() => setPendingDelete(check)}
                            className="text-sm text-white/50 transition-colors hover:text-error-light hover:underline disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile compact list */}
            <div className="divide-y divide-white/10 md:hidden">
              {checks.map((check) => (
                <div key={check.id} className="flex items-center justify-between gap-3 px-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-white">
                      {check.job_title || 'Untitled role'}
                    </div>
                    {check.company_name ? (
                      <div className="truncate text-sm text-white/70">
                        {check.company_name}
                      </div>
                    ) : null}
                    <div className="mt-1 flex items-center gap-2">
                      <StatusBadge status={check.status} tone="dark" />
                      <span className="text-xs text-white/70">
                        {formatDate(check.created_at)}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <ScoreBadge score={check.interview_probability_score} tone="dark" />
                    <Link
                      to={checkActionHref(check)}
                      className="text-sm font-medium text-blue-light hover:underline"
                    >
                      {checkActionLabel(check)}
                    </Link>
                    <button
                      type="button"
                      disabled={deletingId === check.id}
                      onClick={() => setPendingDelete(check)}
                      className="text-xs text-white/50 hover:text-error-light hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {lockedCount > 0 && !isPower ? (
          <div className="mt-3 flex flex-col items-center gap-3 rounded-[16px] border border-blue-light/30 bg-white/[0.04] p-4 text-center sm:flex-row sm:justify-between sm:text-left">
            <p className="text-sm font-medium text-white">Upgrade to Power to see your full check history.</p>
            <Link to="/account/billing" className="shrink-0">
              <Button variant="light" size="sm">
                Upgrade to Power
              </Button>
            </Link>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this check?"
        description="This will permanently delete this check and its associated data. This cannot be undone."
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        busy={pendingDelete !== null && deletingId === pendingDelete.id}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </>
  )
}
