import Link from 'next/link'
import { requireAdmin } from '@/server/auth'
import { serviceClient } from '@/server/supabase'
import { pageRange, parsePage, parsePageSize, totalPages } from '@/lib/params'
import { formatDateTime } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { ErrorState } from '@/components/ui/States'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { ButtonLink } from '@/components/ui/Button'

export const dynamic = 'force-dynamic'

interface Row {
  id: number
  user_id: string
  entry_type: string
  credit_type: string
  amount: number
  note: string | null
  created_at: string
  related_check_id: string | null
  batch_id: string | null
  profiles: { email: string } | null
}

export default async function CreditsPage({
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
    .from('check_ledger')
    .select(
      'id, user_id, entry_type, credit_type, amount, note, created_at, related_check_id, batch_id, profiles!inner(email)',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(range.from, range.to)

  const rows = (data ?? []) as unknown as Row[]
  const pageCount = totalPages(count ?? 0, pageSize)

  const columns: Column<Row>[] = [
    {
      key: 'user',
      header: 'Customer',
      render: (row) => (
        <Link href={`/users/${row.user_id}`} className="font-medium text-blue hover:underline">
          {row.profiles?.email ?? 'unknown'}
        </Link>
      ),
    },
    {
      key: 'type',
      header: 'Entry',
      render: (row) => (
        <span className="flex flex-wrap items-center gap-1">
          <Badge tone={row.amount >= 0 ? 'success' : 'neutral'}>{row.entry_type}</Badge>
          <span className="text-xs text-text-caption">{row.credit_type}</span>
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      numeric: true,
      render: (row) => (
        <span className={row.amount >= 0 ? 'text-success-deep' : 'text-text-primary'}>
          {row.amount > 0 ? '+' : ''}
          {row.amount}
        </span>
      ),
    },
    {
      key: 'check',
      header: 'Check',
      render: (row) =>
        row.related_check_id ? (
          <Link
            href={`/checks/${row.related_check_id}`}
            className="font-mono text-xs text-blue hover:underline"
          >
            {row.related_check_id.slice(0, 8)}...
          </Link>
        ) : (
          <span className="text-text-caption">-</span>
        ),
    },
    {
      key: 'note',
      header: 'Note',
      render: (row) => <span className="text-text-secondary">{row.note ?? '-'}</span>,
    },
    {
      key: 'created',
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
        title="Credits"
        description="The immutable ledger. Every movement of every credit, newest first. Nothing here can be edited: balances change only by appending an entry."
        actions={<ButtonLink href="/export/credits">Export CSV</ButtonLink>}
      />

      {error ? (
        <ErrorState title="Could not load the ledger" detail={error.message} />
      ) : (
        <Card className="overflow-hidden">
          <DataTable
            rows={rows}
            columns={columns}
            getKey={(row) => String(row.id)}
            caption="Credit ledger"
            emptyTitle="No ledger entries yet"
          />
          {rows.length > 0 ? (
            <Pagination
              page={page}
              pageCount={pageCount}
              totalRows={count ?? 0}
              buildHref={(target) => `/credits?page=${Math.min(Math.max(target, 1), pageCount)}`}
            />
          ) : null}
        </Card>
      )}
    </div>
  )
}
