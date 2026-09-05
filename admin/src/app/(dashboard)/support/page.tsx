import Link from 'next/link'
import { requireAdmin } from '@/server/auth'
import { serviceClient } from '@/server/supabase'
import { pageRange, parsePage, parsePageSize, totalPages } from '@/lib/params'
import { formatDateTime } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { ErrorState } from '@/components/ui/States'
import { PageHeader } from '@/components/dashboard/PageHeader'

export const dynamic = 'force-dynamic'

interface Row {
  id: string
  user_id: string
  body: string
  category: string
  status: string
  created_at: string
  profiles: { email: string } | null
}

const STATUS_TONE: Record<string, BadgeTone> = {
  open: 'warning',
  waiting: 'info',
  resolved: 'success',
}

export default async function SupportPage({
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
    .from('admin_support_notes')
    .select('id, user_id, body, category, status, created_at, profiles!inner(email)', {
      count: 'exact',
    })
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
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>{row.status}</Badge>,
    },
    { key: 'category', header: 'Category', render: (row) => <Badge>{row.category}</Badge> },
    {
      key: 'body',
      header: 'Note',
      render: (row) => (
        <span className="line-clamp-2 max-w-xl whitespace-pre-wrap text-text-secondary">
          {row.body}
        </span>
      ),
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
        title="Support"
        description="Internal notes about customer accounts. Add a note from a user's page. Never visible to the customer."
      />

      {error ? (
        <ErrorState title="Could not load support notes" detail={error.message} />
      ) : (
        <Card className="overflow-hidden">
          <DataTable
            rows={rows}
            columns={columns}
            getKey={(row) => row.id}
            caption="Support notes"
            emptyTitle="No support notes yet"
            emptyDescription="Open a user from the Users screen to add the first one."
          />
          {rows.length > 0 ? (
            <Pagination
              page={page}
              pageCount={pageCount}
              totalRows={count ?? 0}
              buildHref={(target) => `/support?page=${Math.min(Math.max(target, 1), pageCount)}`}
            />
          ) : null}
        </Card>
      )}
    </div>
  )
}
