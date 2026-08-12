import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ScoreBadge, StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/Badge'
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
  const { user } = useAuth()
  const [checks, setChecks] = useState<Check[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Check | null>(null)

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

  useEffect(() => {
    if (!pendingDelete) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setPendingDelete(null)
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [pendingDelete])

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
          <Link to="/checks/new">
            <Button size="sm">New Check</Button>
          </Link>
        }
      />

      {loading ? (
        <p className="text-sm text-text-secondary">Loading checks...</p>
      ) : error ? (
        <p className="text-sm text-error">{error}</p>
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
          <div className="hidden overflow-hidden rounded-xl border border-navy md:block">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-background">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">
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
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {checks.map((check) => (
                  <tr key={check.id}>
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-text-primary">
                        {check.job_title || 'Untitled role'}
                      </div>
                      {check.company_name ? (
                        <div className="text-sm text-text-secondary">{check.company_name}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={check.status} />
                    </td>
                    <td className="px-4 py-4">
                      <ScoreBadge score={check.interview_probability_score} />
                    </td>
                    <td className="px-4 py-4 text-sm text-text-secondary">
                      {formatDate(check.created_at)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-4">
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
                          className="text-sm text-text-secondary hover:text-error hover:underline disabled:opacity-50"
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
          <div className="divide-y divide-border rounded-xl border border-navy bg-surface md:hidden">
            {checks.map((check) => (
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

      {pendingDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#05050D]/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingDelete(null)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-check-title"
            className="w-full max-w-sm rounded-2xl border border-navy bg-surface p-[16px] shadow-lg sm:p-6"
          >
            <h2 id="delete-check-title" className="text-base font-semibold text-text-primary">
              Delete this check?
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              This will permanently delete this check and its associated data. This cannot be
              undone.
            </p>
            <div className="mt-[16px] flex justify-end gap-3 sm:mt-6">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={deletingId === pendingDelete.id}
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={deletingId === pendingDelete.id}
                onClick={() => void handleConfirmDelete()}
                className="!border-error bg-error hover:!bg-error/90"
              >
                {deletingId === pendingDelete.id ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
