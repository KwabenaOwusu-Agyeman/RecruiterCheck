import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/server/auth'
import { serviceClient } from '@/server/supabase'
import { canViewReports } from '@/lib/report'
import { escapeLikeTerm, pageRange, parsePage, parsePageSize, parseSearch, totalPages } from '@/lib/params'
import { formatDateTime } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Pagination } from '@/components/ui/Pagination'
import { ErrorState } from '@/components/ui/States'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { SearchBox } from '@/components/dashboard/SearchBox'

export const dynamic = 'force-dynamic'

interface Row {
  id: string
  user_id: string
  job_title: string | null
  company_name: string | null
  created_at: string
  interview_probability_score: number | null
  profiles: { email: string } | null
}

// Index of completed checks, each linking to its audited report page. This
// list shows no report text and no job description; opening a report is what
// gets audited, so the list itself is not. Owner only, like the report page.
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; size?: string }>
}) {
  const { admin, timezone } = await requireAdmin()
  if (!canViewReports(admin.role)) notFound()

  const params = await searchParams
  const search = parseSearch(params.q)
  const page = parsePage(params.page)
  const pageSize = parsePageSize(params.size)
  const range = pageRange(page, pageSize)
  const db = serviceClient()

  let query = db
    .from('checks')
    .select(
      'id, user_id, job_title, company_name, created_at, interview_probability_score, profiles!inner(email)',
      { count: 'exact' },
    )
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .range(range.from, range.to)

  if (search) {
    const term = escapeLikeTerm(search)
    query = query.or(`job_title.ilike.%${term}%,company_name.ilike.%${term}%`)
  }

  const { data, count, error } = await query
  const rows = (data ?? []) as unknown as Row[]
  const pageCount = totalPages(count ?? 0, pageSize)

  // Ratings for this page only, so the operator can go straight to the
  // reports users reacted to. Comments are read on the report page, not here.
  const ratings = new Map<string, number>()
  if (rows.length > 0) {
    const { data: feedback } = await db
      .from('product_feedback')
      .select('check_id, rating, created_at')
      .in(
        'check_id',
        rows.map((row) => row.id),
      )
      .order('created_at', { ascending: true })
    for (const item of feedback ?? []) {
      if (item.check_id) ratings.set(item.check_id, item.rating)
    }
  }

  const columns: Column<Row>[] = [
    {
      key: 'report',
      header: 'Report',
      render: (row) => (
        <Link href={`/checks/${row.id}/report`} className="font-medium text-blue hover:underline">
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
      key: 'score',
      header: 'Score',
      render: (row) => <span className="tabular">{row.interview_probability_score ?? '-'}</span>,
    },
    {
      key: 'rating',
      header: 'User rating',
      render: (row) => {
        const rating = ratings.get(row.id)
        return (
          <span className="tabular text-text-secondary">
            {rating === undefined ? 'none' : `${rating} of 5`}
          </span>
        )
      },
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
    next.set('page', String(Math.min(Math.max(target, 1), pageCount)))
    return `/reports?${next.toString()}`
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        description="Every completed check. Open one to read the report the candidate received. Each report you open is recorded in the audit log."
      />

      <SearchBox placeholder="Search by job title or company" />

      {error ? (
        <ErrorState title="Could not load reports" detail={error.message} />
      ) : (
        <Card className="overflow-hidden">
          <DataTable
            rows={rows}
            columns={columns}
            getKey={(row) => row.id}
            caption="Completed check reports"
            emptyTitle="No completed checks match"
          />
          {rows.length > 0 ? (
            <Pagination page={page} pageCount={pageCount} totalRows={count ?? 0} buildHref={buildHref} />
          ) : null}
        </Card>
      )}
    </div>
  )
}
