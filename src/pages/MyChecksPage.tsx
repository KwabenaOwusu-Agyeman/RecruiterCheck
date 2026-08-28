import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { ScoreBadge, StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { usePageMeta } from '@/hooks/usePageMeta'
import { deleteCheck, getCheckCount, getChecks } from '@/services/checkService'
import type { Check } from '@/types'
import { cn } from '@/utils/cn'

// Fixed, literal (not interpolated) arbitrary-value classes so Tailwind's
// build-time class scanner can find them — a template-string class name
// built from a runtime variable wouldn't be. Row stagger is capped at index
// 8 below, matching this array's length. Replaces motion/react's per-row
// initial/animate/transition (which triggered a real style-src CSP
// violation here — motion.tr's transform values on a table row appear to
// go through setAttribute('style', ...) rather than direct CSSOM property
// assignment, unlike its other, verified-safe uses elsewhere in the app).
const ROW_STAGGER_DELAY_CLASS = [
  '[animation-delay:0ms]',
  '[animation-delay:40ms]',
  '[animation-delay:80ms]',
  '[animation-delay:120ms]',
  '[animation-delay:160ms]',
  '[animation-delay:200ms]',
  '[animation-delay:240ms]',
  '[animation-delay:280ms]',
  '[animation-delay:320ms]',
]

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
  usePageMeta({ title: 'My Checks | MyRecruiterCheck', description: 'View your Recruiter Checks.', path: '/checks', noindex: true })
  const { user } = useAuth()
  const [checks, setChecks] = useState<Check[]>([])
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Check | null>(null)

  // RLS itself only returns the single most recent check row for a
  // Starter-only user (see migration gate_check_history_by_pack) — `checks`
  // is already the entitled set, nothing to slice client-side. totalCount
  // comes from a separate count-only RPC so the "N earlier checks are
  // locked" message stays accurate without needing the (deliberately
  // hidden) row content.
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
          <Link to="/checks/keyword-scan">
            <Button variant="secondary" size="sm" className="w-full sm:w-auto">
              Free Keyword Scan
            </Button>
          </Link>
        }
      />

      {loading ? (
        <Card className="divide-y divide-border">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex items-center justify-between gap-3 px-4 py-4">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-[14px] w-1/3" />
                <Skeleton className="h-[10px] w-1/4" />
              </div>
              <Skeleton className="h-[14px] w-10 shrink-0" />
            </div>
          ))}
        </Card>
      ) : error ? (
        <Alert variant="error">{error}</Alert>
      ) : checks.length === 0 ? (
        <EmptyState
          title="No checks yet"
          description="Add a job and your CV to see your application from a recruiter's perspective."
          visual={
            <div className="space-y-2">
              {[{ w: 'w-2/5', score: 'bg-success/30' }, { w: 'w-1/2', score: 'bg-warning/30' }, { w: 'w-1/3', score: 'bg-border-strong' }].map(
                (row, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between gap-3 rounded-[8px] border border-border-soft bg-background px-4 py-3"
                  >
                    <span className={cn('h-[10px] rounded-full bg-border-strong', row.w)} />
                    <span className={cn('h-[10px] w-10 rounded-full', row.score)} />
                  </div>
                ),
              )}
            </div>
          }
          action={
            <Link to="/checks/new">
              <Button size="sm">New Check</Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-hidden md:block">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-background">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-caption lg:px-6">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-caption">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-caption">
                    Score
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-caption">
                    Date
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-text-caption lg:px-6">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {checks.map((check, index) => (
                  <tr
                    key={check.id}
                    className={cn(
                      'animate-row-fade-in-up transition-colors duration-150 hover:bg-navy-tint/60',
                      ROW_STAGGER_DELAY_CLASS[Math.min(index, 8)],
                    )}
                  >
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
                          className="text-sm text-text-secondary transition-colors hover:text-error hover:underline disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile compact list */}
          <Card className="divide-y divide-border md:hidden">
            {checks.map((check, index) => (
              <div
                key={check.id}
                className={cn(
                  'animate-row-fade-in-up flex items-center justify-between gap-3 px-4 py-3',
                  ROW_STAGGER_DELAY_CLASS[Math.min(index, 8)],
                )}
              >
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
          </Card>
        </>
      )}

      {lockedCount > 0 ? (
        <Card className="mt-6 flex flex-col items-center gap-3 p-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <p className="text-sm font-medium text-navy">
            {lockedCount} earlier {lockedCount === 1 ? 'check is' : 'checks are'} locked. Active and
            Power packs unlock your full check history.
          </p>
          <Link to="/pricing" className="shrink-0">
            <Button size="sm">View packs</Button>
          </Link>
        </Card>
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
