import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { ScoreBadge, StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { deleteCheck, getChecks } from '@/services/checkService'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Check | null>(null)

  // Only Power keeps full check history visible. Starter/Active/Free see
  // only their most recent check (getChecks already orders newest first) —
  // older ones stay in the database untouched, just hidden behind an
  // upgrade prompt, so nothing here is ever destructive or hard to reverse.
  const isPower = profile?.subscription_tier === 'power'
  const visibleChecks = isPower ? checks : checks.slice(0, 1)
  const lockedCount = checks.length - visibleChecks.length

  useEffect(() => {
    async function loadChecks() {
      if (!user) return

      try {
        const data = await getChecks(user.id)
        setChecks(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load checks')
      } finally {
        setLoading(false)
      }
    }

    void loadChecks()
  }, [user])

  async function handleConfirmDelete() {
    if (!pendingDelete) return
    const checkId = pendingDelete.id

    setDeletingId(checkId)
    setError(null)

    try {
      await deleteCheck(checkId)
      setChecks((prev) => prev.filter((check) => check.id !== checkId))
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
          <Link to="/checks/new" className="block w-full sm:inline-block sm:w-auto">
            <Button size="sm" className="w-full sm:w-auto">
              New Check
            </Button>
          </Link>
        }
      />

      {loading ? (
        <div className="divide-y divide-border rounded-[16px] border border-border-soft bg-surface shadow-card">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex items-center justify-between gap-3 px-4 py-4">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-4 w-10 shrink-0" />
            </div>
          ))}
        </div>
      ) : error ? (
        <Alert variant="error">{error}</Alert>
      ) : checks.length === 0 ? (
        <EmptyState
          title="No checks yet"
          description="Add a job and your CV to see your application from a recruiter's perspective."
          action={
            <Link to="/checks/new">
              <Button size="sm">New Check</Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-[16px] border border-border-soft bg-surface shadow-card md:block">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-surface-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary lg:px-6">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Score
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Date
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-text-secondary lg:px-6">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {visibleChecks.map((check) => (
                  <tr key={check.id} className="transition-colors duration-150 hover:bg-navy-tint/60">
                    <td className="px-4 py-4 lg:px-6 lg:py-5">
                      <div className="text-sm font-medium text-text-primary">
                        {check.job_title || 'Untitled role'}
                      </div>
                      {check.company_name ? (
                        <div className="text-sm text-text-secondary">{check.company_name}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 lg:py-5">
                      <StatusBadge status={check.status} />
                    </td>
                    <td className="px-4 py-4 lg:py-5">
                      <ScoreBadge score={check.interview_probability_score} />
                    </td>
                    <td className="px-4 py-4 text-sm text-text-secondary lg:py-5">
                      {formatDate(check.created_at)}
                    </td>
                    <td className="px-4 py-4 lg:px-6 lg:py-5">
                      <div className="flex items-center justify-end gap-4">
                        <Link
                          to={checkActionHref(check)}
                          className="text-sm font-semibold text-blue hover:underline"
                        >
                          {checkActionLabel(check)}
                        </Link>
                        <button
                          type="button"
                          disabled={deletingId === check.id}
                          onClick={() => setPendingDelete(check)}
                          className="text-sm text-text-secondary/70 transition-colors hover:text-error hover:underline disabled:opacity-50"
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
          <div className="divide-y divide-border rounded-[16px] border border-border-soft bg-surface shadow-card md:hidden">
            {visibleChecks.map((check) => (
              <div key={check.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-text-primary">
                    {check.job_title || 'Untitled role'}
                  </div>
                  {check.company_name ? (
                    <div className="truncate text-sm text-text-secondary">
                      {check.company_name}
                    </div>
                  ) : null}
                  <div className="mt-1 flex items-center gap-2">
                    <StatusBadge status={check.status} />
                    <span className="text-xs text-text-secondary">
                      {formatDate(check.created_at)}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <ScoreBadge score={check.interview_probability_score} />
                  <Link
                    to={checkActionHref(check)}
                    className="text-sm font-medium text-blue hover:underline"
                  >
                    {checkActionLabel(check)}
                  </Link>
                  <button
                    type="button"
                    disabled={deletingId === check.id}
                    onClick={() => setPendingDelete(check)}
                    className="text-xs text-text-secondary hover:text-error hover:underline disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {lockedCount > 0 ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-[16px] border border-border-soft bg-surface p-4 text-center shadow-card sm:flex-row sm:justify-between sm:text-left">
          <p className="text-sm text-text-secondary">
            {lockedCount === 1
              ? '1 earlier check is locked.'
              : `${lockedCount} earlier checks are locked.`}{' '}
            Upgrade to Power to see your full check history, saved forever.
          </p>
          <Link to="/account/billing" className="shrink-0">
            <Button variant="secondary" size="sm">
              Upgrade to Power
            </Button>
          </Link>
        </div>
      ) : null}

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
