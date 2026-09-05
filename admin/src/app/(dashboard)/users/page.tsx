import Link from 'next/link'
import { requireAdmin } from '@/server/auth'
import { serviceClient } from '@/server/supabase'
import { listUsers } from '@/server/queries/users'
import { parsePage, parsePageSize, parseSearch, totalPages } from '@/lib/params'
import { formatDate, formatRelative } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { ErrorState } from '@/components/ui/States'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { SearchBox } from '@/components/dashboard/SearchBox'
import { ButtonLink } from '@/components/ui/Button'

export const dynamic = 'force-dynamic'

interface Row {
  id: string
  email: string
  fullName: string | null
  createdAt: string
  lastSignInAt: string | null
  emailConfirmedAt: string | null
  checksBalance: number
  lifetimeChecksConsumed: number
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; size?: string }>
}) {
  const { timezone } = await requireAdmin()
  const params = await searchParams

  const search = parseSearch(params.q)
  const page = parsePage(params.page)
  const pageSize = parsePageSize(params.size)
  const now = new Date()

  const result = await listUsers(serviceClient(), { search, page, pageSize })
  const pageCount = totalPages(result.totalRows, pageSize)

  const columns: Column<Row>[] = [
    {
      key: 'email',
      header: 'User',
      render: (row) => (
        <Link href={`/users/${row.id}`} className="font-medium text-blue hover:underline">
          {row.email}
          {row.fullName ? (
            <span className="block text-xs font-normal text-text-caption">{row.fullName}</span>
          ) : null}
        </Link>
      ),
    },
    {
      key: 'verified',
      header: 'Verified',
      render: (row) =>
        row.emailConfirmedAt ? (
          <Badge tone="success">Verified</Badge>
        ) : (
          <Badge tone="warning">Unverified</Badge>
        ),
    },
    {
      key: 'signup',
      header: 'Signed up',
      render: (row) => (
        <span className="text-text-secondary">{formatDate(row.createdAt, timezone)}</span>
      ),
    },
    {
      key: 'active',
      header: 'Last active',
      render: (row) => (
        <span className="text-text-secondary">{formatRelative(row.lastSignInAt, now)}</span>
      ),
    },
    {
      key: 'balance',
      header: 'Credits',
      numeric: true,
      render: (row) => row.checksBalance,
    },
    {
      key: 'used',
      header: 'Checks used',
      numeric: true,
      render: (row) => row.lifetimeChecksConsumed,
    },
  ]

  const buildHref = (target: number) => {
    const next = new URLSearchParams()
    if (search) next.set('q', search)
    if (pageSize !== 25) next.set('size', String(pageSize))
    next.set('page', String(Math.min(Math.max(target, 1), pageCount)))
    return `/users?${next.toString()}`
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Users"
        description="Every account, with its credit balance and activity. CV contents are never shown here, and a deleted file stays deleted."
        actions={
          <ButtonLink href={`/export/users${search ? `?q=${encodeURIComponent(search)}` : ''}`}>
            Export CSV
          </ButtonLink>
        }
      />

      <SearchBox placeholder="Search by email or name" />

      {result.error ? (
        <ErrorState title="Could not load users" detail={result.error} />
      ) : (
        <Card className="overflow-hidden">
          <DataTable
            rows={result.rows}
            columns={columns}
            getKey={(row) => row.id}
            caption="User directory"
            emptyTitle={search ? 'No users match that search' : 'No users yet'}
            emptyDescription={
              search ? 'Try a different email address or name.' : undefined
            }
          />
          {result.rows.length > 0 ? (
            <Pagination
              page={page}
              pageCount={pageCount}
              totalRows={result.totalRows}
              buildHref={buildHref}
            />
          ) : null}
        </Card>
      )}
    </div>
  )
}
