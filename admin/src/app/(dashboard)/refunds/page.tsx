import Link from 'next/link'
import { requireAdmin } from '@/server/auth'
import { serviceClient } from '@/server/supabase'
import { isStripeConfigured, reconcileRefund, type RefundReconciliation } from '@/server/stripe'
import { pageRange, parsePage, parsePageSize, totalPages } from '@/lib/params'
import { formatDateTime, formatMoney, shortId } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { Alert, ErrorState } from '@/components/ui/States'
import { PageHeader } from '@/components/dashboard/PageHeader'

export const dynamic = 'force-dynamic'

interface Row {
  id: string
  user_id: string
  batch_id: string
  status: string
  stripe_refund_id: string | null
  reason: string | null
  reason_detail: string | null
  attempt_number: number
  created_at: string
  finalized_at: string | null
  profiles: { email: string } | null
  credit_batches: { amount_paid: number | null; currency: string | null; pack_id: string | null } | null
}

const STATUS_TONE: Record<string, BadgeTone> = {
  succeeded: 'success',
  failed: 'danger',
  pending: 'warning',
}

export default async function RefundsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { timezone } = await requireAdmin()
  const params = await searchParams
  const page = parsePage(params.page)
  const pageSize = parsePageSize(undefined)
  const range = pageRange(page, pageSize)
  const now = new Date()

  const { data, count, error } = await serviceClient()
    .from('refund_events')
    .select(
      'id, user_id, batch_id, status, stripe_refund_id, reason, reason_detail, attempt_number, created_at, finalized_at, profiles!inner(email), credit_batches!inner(amount_paid, currency, pack_id)',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(range.from, range.to)

  const rows = (data ?? []) as unknown as Row[]
  const pageCount = totalPages(count ?? 0, pageSize)

  const reconciliations = new Map<string, RefundReconciliation>()
  await Promise.all(
    rows.map(async (row) => {
      reconciliations.set(row.id, await reconcileRefund(row.stripe_refund_id))
    }),
  )

  // Pending for more than a couple of minutes means the ambiguous-failure path
  // was hit and nothing has resolved it.
  const stuck = rows.filter(
    (row) => row.status === 'pending' && now.getTime() - new Date(row.created_at).getTime() > 120_000,
  )

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
      render: (row) => (
        <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>{row.status}</Badge>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      numeric: true,
      render: (row) =>
        row.credit_batches?.amount_paid != null && row.credit_batches.currency
          ? formatMoney(row.credit_batches.amount_paid, row.credit_batches.currency)
          : '-',
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row) => (
        <span title={row.reason_detail ?? undefined} className="text-text-secondary">
          {row.reason ?? 'not given'}
        </span>
      ),
    },
    {
      key: 'stripe',
      header: 'Stripe',
      render: (row) => {
        const rec = reconciliations.get(row.id)
        if (!rec) return '-'
        const tone: BadgeTone =
          rec.status === 'matched'
            ? 'success'
            : rec.status === 'not_checked'
              ? 'neutral'
              : rec.status === 'lookup_failed'
                ? 'warning'
                : 'danger'
        return (
          <span title={rec.detail ?? undefined}>
            <Badge tone={tone}>{rec.stripeStatus ?? rec.status.replace(/_/g, ' ')}</Badge>
          </span>
        )
      },
    },
    {
      key: 'refundId',
      header: 'Refund id',
      render: (row) => (
        <span className="font-mono text-xs text-text-caption">{shortId(row.stripe_refund_id)}</span>
      ),
    },
    {
      key: 'created',
      header: 'Requested',
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
        title="Refunds"
        description="Read only in this phase. Refunds are not executed from this dashboard; customers request them through the app's own guarantee flow."
      />

      {stuck.length > 0 ? (
        <Alert tone="danger" title={`${stuck.length} refund(s) stuck pending`}>
          <p>
            The reconciler that would resolve these, reconcile-ambiguous-refunds, is deployed but
            has no cron schedule and no CRON_INVOKE_SECRET set, so nothing is currently clearing
            them. The customer&apos;s credit batch stays at refund_pending until it is resolved.
            Check the Stripe column for the true status.
          </p>
        </Alert>
      ) : null}

      {!isStripeConfigured() ? (
        <Alert tone="warning" title="Not verified against Stripe">
          STRIPE_SECRET_KEY is not configured, so the Stripe column shows nothing. These rows are
          the application&apos;s own record only.
        </Alert>
      ) : null}

      {error ? (
        <ErrorState title="Could not load refunds" detail={error.message} />
      ) : (
        <Card className="overflow-hidden">
          <DataTable
            rows={rows}
            columns={columns}
            getKey={(row) => row.id}
            caption="Refunds"
            emptyTitle="No refunds yet"
          />
          {rows.length > 0 ? (
            <Pagination
              page={page}
              pageCount={pageCount}
              totalRows={count ?? 0}
              buildHref={(target) => `/refunds?page=${Math.min(Math.max(target, 1), pageCount)}`}
            />
          ) : null}
        </Card>
      )}
    </div>
  )
}
