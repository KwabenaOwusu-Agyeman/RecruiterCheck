import Link from 'next/link'
import { requireAdmin } from '@/server/auth'
import { serviceClient } from '@/server/supabase'
import { escapeLikeTerm, pageRange, parsePage, parsePageSize, parseSearch, totalPages } from '@/lib/params'
import { formatDateTime } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge, checkStatusTone } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { ErrorState } from '@/components/ui/States'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { SearchBox } from '@/components/dashboard/SearchBox'
import { ButtonLink } from '@/components/ui/Button'
import { StatusFilter } from './StatusFilter'
import type { CheckStatus } from '@/types/db'

export const dynamic = 'force-dynamic'

const STATUSES: readonly CheckStatus[] = ['draft', 'processing', 'completed', 'failed']

interface Row {
  id: string
  user_id: string
  job_title: string | null
  company_name: string | null
  status: CheckStatus
  created_at: string
  updated_at: string
  funding_pack_id: string | null
  uploads_purged: boolean
  error_message: string | null
  profiles: { email: string } | null
}

export default async function ChecksPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; size?: string; status?: string }>
}) {
  const { timezone } = await requireAdmin()
  const params = await searchParams

  const search = parseSearch(params.q)
  const page = parsePage(params.page)
  const pageSize = parsePageSize(params.size)
  const status = (STATUSES as readonly string[]).includes(params.status ?? '')
    ? (params.status as CheckStatus)
    : null
  const range = pageRange(page, pageSize)

  let query = serviceClient()
    .from('checks')
    // job_description and the cv_* fields are deliberately not selected. The
    // operator needs to know which check this is and what happened to it, never
    // the candidate's document.
    .select(
      'id, user_id, job_title, company_name, status, created_at, updated_at, funding_pack_id, uploads_purged, error_message, profiles!inner(email)',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(range.from, range.to)

  if (status) query = query.eq('status', status)
  if (search) {
    const term = escapeLikeTerm(search)
    query = query.or(`job_title.ilike.%${term}%,company_name.ilike.%${term}%`)
  }

  const { data, count, error } = await query
  const rows = (data ?? []) as unknown as Row[]
  const pageCount = totalPages(count ?? 0, pageSize)

  const columns: Column<Row>[] = [
    {
      key: 'check',
      header: 'Check',
      render: (row) => (
        <Link href={`/checks/${row.id}`} className="font-medium text-blue hover:underline">
          {row.job_title ?? 'Untitled check'}
          {row.company_name ? (
            <span className="block text-xs font-normal text-text-caption">{row.company_name}</span>
          ) : null}
        </Link>
      ),
    },
    {
      key: 'user',
      header: 'User',
      render: (row) => (
        <Link href={`/users/${row.user_id}`} className="text-text-secondary hover:underline">
          {row.profiles?.email ?? 'unknown'}
        </Link>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={checkStatusTone(row.status)}>{row.status}</Badge>,
    },
    {
      key: 'pack',
      header: 'Funded by',
      render: (row) => (
        <span className="text-text-secondary">{row.funding_pack_id ?? 'Free'}</span>
      ),
    },
    {
      key: 'file',
      header: 'CV file',
      render: (row) =>
        row.uploads_purged ? (
          <Badge tone="neutral">Deleted</Badge>
        ) : (
          <Badge tone="info">Retained</Badge>
        ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (row) => (
        <span className="whitespace-nowrap text-text-secondary">
          {formatDateTime(row.created_at, timezone)}
        </span>
      ),
    },
  ]

  const buildHref = (target: number) => {
    const next = new URLSearchParams()
    if (search) next.set('q', search)
    if (status) next.set('status', status)
    next.set('page', String(Math.min(Math.max(target, 1), pageCount)))
    return `/checks?${next.toString()}`
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Application Checks"
        description="Every check with its status, funding and file retention. Scoring internals and CV contents are never shown."
        actions={<ButtonLink href="/export/checks">Export CSV</ButtonLink>}
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox placeholder="Search by job title or company" />
        <StatusFilter active={status} />
      </div>

      {error ? (
        <ErrorState title="Could not load checks" detail={error.message} />
      ) : (
        <Card className="overflow-hidden">
          <DataTable
            rows={rows}
            columns={columns}
            getKey={(row) => row.id}
            caption="Application checks"
            emptyTitle="No checks match"
          />
          {rows.length > 0 ? (
            <Pagination
              page={page}
              pageCount={pageCount}
              totalRows={count ?? 0}
              buildHref={buildHref}
            />
          ) : null}
        </Card>
      )}
    </div>
  )
}
