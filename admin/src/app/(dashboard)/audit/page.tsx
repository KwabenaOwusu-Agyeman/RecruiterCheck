import { requireAdmin } from '@/server/auth'
import { serviceClient } from '@/server/supabase'
import { pageRange, parsePage, parsePageSize, totalPages } from '@/lib/params'
import { formatDateTime, shortId } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { Alert, ErrorState } from '@/components/ui/States'
import { PageHeader } from '@/components/dashboard/PageHeader'
import type { AdminAuditLogRow } from '@/types/db'

export const dynamic = 'force-dynamic'

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { timezone } = await requireAdmin()
  const params = await searchParams
  const page = parsePage(params.page)
  const pageSize = parsePageSize(undefined)
  const range = pageRange(page, pageSize)

  const { data, count, error } = await serviceClient()
    .from('admin_audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(range.from, range.to)

  const rows = (data ?? []) as AdminAuditLogRow[]
  const pageCount = totalPages(count ?? 0, pageSize)

  const columns: Column<AdminAuditLogRow>[] = [
    {
      key: 'result',
      header: 'Result',
      render: (row) => (
        <Badge tone={row.result === 'success' ? 'success' : 'danger'}>{row.result}</Badge>
      ),
    },
    { key: 'action', header: 'Action', render: (row) => <span className="font-medium">{row.action}</span> },
    { key: 'admin', header: 'Administrator', render: (row) => row.admin_email },
    {
      key: 'target',
      header: 'Target',
      render: (row) => (
        <span className="text-text-secondary">
          {row.target_type ?? '-'}
          {row.target_id ? (
            <span className="ml-1 font-mono text-xs text-text-caption">
              {shortId(row.target_id)}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row) => <span className="text-text-secondary">{row.reason ?? '-'}</span>,
    },
    {
      key: 'error',
      header: 'Error',
      render: (row) => (
        <span className="text-text-caption">{row.error_summary ?? '-'}</span>
      ),
    },
    {
      key: 'correlation',
      header: 'Correlation',
      render: (row) => (
        <span className="font-mono text-xs text-text-caption">{shortId(row.correlation_id)}</span>
      ),
    },
    {
      key: 'when',
      header: 'When',
      render: (row) => (
        <span className="whitespace-nowrap text-text-secondary">
          {formatDateTime(row.created_at, timezone)}
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Admin Audit Log"
        description="Every privileged action taken in this dashboard, successful or failed."
      />

      <Alert tone="info" title="Append only">
        This log cannot be edited or deleted from the application. The database revokes UPDATE and
        DELETE on it, and row and statement level triggers reject UPDATE, DELETE and TRUNCATE
        regardless of the role issuing them.
      </Alert>

      {error ? (
        <ErrorState title="Could not load the audit log" detail={error.message} />
      ) : (
        <Card className="overflow-hidden">
          <DataTable
            rows={rows}
            columns={columns}
            getKey={(row) => row.id}
            caption="Admin audit log"
            emptyTitle="No admin actions recorded yet"
            emptyDescription="Privileged actions appear here as soon as one is taken."
          />
          {rows.length > 0 ? (
            <Pagination
              page={page}
              pageCount={pageCount}
              totalRows={count ?? 0}
              buildHref={(target) => `/audit?page=${Math.min(Math.max(target, 1), pageCount)}`}
            />
          ) : null}
        </Card>
      )}
    </div>
  )
}
