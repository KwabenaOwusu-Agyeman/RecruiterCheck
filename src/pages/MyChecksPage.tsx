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

  async function handleDelete(checkId: string) {
    const confirmed = window.confirm(
      'Delete this check permanently? This removes the CV, feedback, and any generated documents. This cannot be undone.',
    )
    if (!confirmed) return

    setDeletingId(checkId)
    setError(null)

    try {
      await deleteCheck(checkId)
      setChecks((prev) => prev.filter((check) => check.id !== checkId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this check')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <PageHeader
        title="My Checks"
        description="Review past recruiter checks and revisit feedback before you apply."
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
          description="Run your first recruiter check to see how your application reads before you submit it."
          action={
            <Link to="/checks/new">
              <Button size="sm">New Check</Button>
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-navy">
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
                        onClick={() => void handleDelete(check.id)}
                        className="text-sm font-medium text-error hover:underline disabled:opacity-50"
                      >
                        {deletingId === check.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
