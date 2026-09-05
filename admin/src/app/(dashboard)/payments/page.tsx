import Link from 'next/link'
import { requireAdmin } from '@/server/auth'
import { serviceClient } from '@/server/supabase'
import { isStripeConfigured, reconcilePayment, type PaymentReconciliation } from '@/server/stripe'
import { pageRange, parsePage, parsePageSize, totalPages } from '@/lib/params'
import { formatDateTime, formatMoney, shortId } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { Alert, ErrorState } from '@/components/ui/States'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { ButtonLink } from '@/components/ui/Button'

export const dynamic = 'force-dynamic'

interface Row {
  id: string
  user_id: string
  pack_id: string | null
  checks_granted: number
  checks_remaining: number
  amount_paid: number | null
  currency: string | null
  paid_at: string | null
  refund_status: string
  stripe_payment_intent_id: string | null
  stripe_checkout_session_id: string | null
  profiles: { email: string } | null
}

const RECONCILIATION_TONE: Record<PaymentReconciliation['status'], BadgeTone> = {
  matched: 'success',
  mismatch: 'danger',
  missing_in_stripe: 'danger',
  lookup_failed: 'warning',
  not_checked: 'neutral',
}

const RECONCILIATION_LABEL: Record<PaymentReconciliation['status'], string> = {
  matched: 'Matches Stripe',
  mismatch: 'Disagrees with Stripe',
  missing_in_stripe: 'Not in Stripe',
  lookup_failed: 'Stripe unreachable',
  not_checked: 'Not checked',
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; size?: string }>
}) {
  const { timezone } = await requireAdmin()
  const params = await searchParams
  const page = parsePage(params.page)
  const pageSize = parsePageSize(params.size)
  const range = pageRange(page, pageSize)

  const { data, count, error } = await serviceClient()
    .from('credit_batches')
    .select(
      'id, user_id, pack_id, checks_granted, checks_remaining, amount_paid, currency, paid_at, refund_status, stripe_payment_intent_id, stripe_checkout_session_id, profiles!inner(email)',
      { count: 'exact' },
    )
    .eq('source', 'purchase')
    .order('paid_at', { ascending: false, nullsFirst: false })
    .range(range.from, range.to)

  const rows = (data ?? []) as unknown as Row[]
  const pageCount = totalPages(count ?? 0, pageSize)

  // Reconciled only for the rows actually on screen. Verifying the whole table
  // on every page load would be a lot of Stripe calls for information nobody is
  // looking at.
  const reconciliations = new Map<string, PaymentReconciliation>()
  await Promise.all(
    rows.map(async (row) => {
      reconciliations.set(
        row.id,
        await reconcilePayment(row.stripe_payment_intent_id, {
          amount: row.amount_paid,
          currency: row.currency,
        }),
      )
    }),
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
    { key: 'pack', header: 'Pack', render: (row) => row.pack_id ?? '-' },
    {
      key: 'amount',
      header: 'Amount',
      numeric: true,
      render: (row) =>
        row.amount_paid !== null && row.currency
          ? formatMoney(row.amount_paid, row.currency)
          : '-',
    },
    {
      key: 'credits',
      header: 'Credits',
      numeric: true,
      render: (row) => `${row.checks_remaining} / ${row.checks_granted}`,
    },
    {
      key: 'refund',
      header: 'Refund',
      render: (row) => (
        <Badge tone={row.refund_status === 'active' ? 'neutral' : 'warning'}>
          {row.refund_status}
        </Badge>
      ),
    },
    {
      key: 'reconciliation',
      header: 'Reconciliation',
      render: (row) => {
        const rec = reconciliations.get(row.id)
        if (!rec) return '-'
        return (
          <span title={rec.detail ?? undefined}>
            <Badge tone={RECONCILIATION_TONE[rec.status]}>
              {RECONCILIATION_LABEL[rec.status]}
            </Badge>
          </span>
        )
      },
    },
    {
      key: 'intent',
      header: 'Payment intent',
      render: (row) => (
        <span className="font-mono text-xs text-text-caption">
          {shortId(row.stripe_payment_intent_id)}
        </span>
      ),
    },
    {
      key: 'paid',
      header: 'Paid',
      render: (row) => (
        <span className="whitespace-nowrap text-text-secondary">
          {row.paid_at ? formatDateTime(row.paid_at, timezone) : '-'}
        </span>
      ),
    },
  ]

  const mismatches = [...reconciliations.values()].filter(
    (r) => r.status === 'mismatch' || r.status === 'missing_in_stripe',
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payments"
        description="Verified purchase records, compared against Stripe. Stripe is authoritative; where the two disagree this says so rather than choosing."
        actions={<ButtonLink href="/export/payments">Export CSV</ButtonLink>}
      />

      {!isStripeConfigured() ? (
        <Alert tone="warning" title="Not reconciled against Stripe">
          STRIPE_SECRET_KEY is not configured for this deployment, so these rows show the
          application&apos;s own record only. Add a restricted read-only key to enable
          reconciliation.
        </Alert>
      ) : null}

      {mismatches.length > 0 ? (
        <Alert tone="danger" title={`${mismatches.length} row(s) disagree with Stripe`}>
          Investigate before treating these as settled. Nothing has been changed automatically.
        </Alert>
      ) : null}

      {error ? (
        <ErrorState title="Could not load payments" detail={error.message} />
      ) : (
        <Card className="overflow-hidden">
          <DataTable
            rows={rows}
            columns={columns}
            getKey={(row) => row.id}
            caption="Payments"
            emptyTitle="No purchases yet"
          />
          {rows.length > 0 ? (
            <Pagination
              page={page}
              pageCount={pageCount}
              totalRows={count ?? 0}
              buildHref={(target) => `/payments?page=${Math.min(Math.max(target, 1), pageCount)}`}
            />
          ) : null}
        </Card>
      )}
    </div>
  )
}
