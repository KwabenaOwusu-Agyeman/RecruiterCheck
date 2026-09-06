import { requireAdmin } from '@/server/auth'
import { serviceClient } from '@/server/supabase'
import { getCampaigns, getNewsletterList, getTransactionalStats } from '@/server/brevo'
import { resolvePeriod } from '@/lib/time'
import { parseCustomRange, parsePeriod } from '@/lib/params'
import { formatDate, formatNumber, formatPercent } from '@/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/States'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { PeriodPicker } from '../PeriodPicker'
import { RefreshButton } from '../RefreshButton'
import type { BrevoCampaign } from '@/server/brevo'

export const dynamic = 'force-dynamic'

function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: number | null
  hint?: string
}) {
  return (
    <div className="rounded-[20px] border border-border-soft bg-surface px-5 py-4 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wide text-text-caption">{label}</p>
      {value === null ? (
        <p className="mt-1 text-xl font-semibold text-text-caption">Unavailable</p>
      ) : (
        <p className="tabular mt-1 text-3xl font-semibold text-text-primary">
          {formatNumber(value)}
        </p>
      )}
      {hint ? <p className="mt-0.5 text-xs text-text-caption">{hint}</p> : null}
    </div>
  )
}

export default async function EmailPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}) {
  const { timezone } = await requireAdmin()
  const params = await searchParams
  const periodId = parsePeriod(params.period)
  const now = new Date()
  const period = resolvePeriod(
    periodId,
    timezone,
    now,
    parseCustomRange(params.from, params.to) ?? undefined,
  )

  const [stats, list, campaigns, localCount] = await Promise.all([
    getTransactionalStats(period.from, period.to),
    getNewsletterList(),
    getCampaigns(),
    serviceClient()
      .from('newsletter_subscribers')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
  ])

  const s = stats.data
  const deliveryRate =
    s?.requests && s.delivered !== null && s.requests > 0 ? (s.delivered / s.requests) * 100 : null
  const openRate =
    s?.delivered && s.uniqueOpens !== null && s.delivered > 0
      ? (s.uniqueOpens / s.delivered) * 100
      : null

  const ourActive = localCount.count ?? null
  const theirTotal = list.data?.totalSubscribers ?? null
  // Reconciled the way Payments reconciles against Stripe: the disagreement is
  // shown rather than one side being silently preferred.
  const listsDisagree =
    ourActive !== null && theirTotal !== null && ourActive !== theirTotal

  const campaignColumns: Column<BrevoCampaign>[] = [
    {
      key: 'name',
      header: 'Campaign',
      render: (c) => (
        <span className="font-medium text-text-primary">
          {c.name ?? 'Untitled'}
          {c.subject ? (
            <span className="block text-xs font-normal text-text-caption">{c.subject}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => <Badge tone={c.status === 'sent' ? 'success' : 'neutral'}>{c.status ?? '-'}</Badge>,
    },
    {
      key: 'sent',
      header: 'Sent',
      numeric: true,
      render: (c) => (c.sent === null ? '-' : formatNumber(c.sent)),
    },
    {
      key: 'delivered',
      header: 'Delivered',
      numeric: true,
      render: (c) => (c.delivered === null ? '-' : formatNumber(c.delivered)),
    },
    {
      key: 'opens',
      header: 'Unique opens',
      numeric: true,
      render: (c) => (c.uniqueOpens === null ? '-' : formatNumber(c.uniqueOpens)),
    },
    {
      key: 'clicks',
      header: 'Unique clicks',
      numeric: true,
      render: (c) => (c.uniqueClicks === null ? '-' : formatNumber(c.uniqueClicks)),
    },
    {
      key: 'date',
      header: 'Sent on',
      render: (c) => (
        <span className="whitespace-nowrap text-text-secondary">
          {c.sentDate ? formatDate(c.sentDate, timezone) : '-'}
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Email"
        description="Transactional and campaign performance from Brevo. Read only: nothing on this screen can send anything."
        actions={<RefreshButton />}
      />

      <PeriodPicker active={periodId} />

      {stats.state === 'not_configured' ? (
        <Alert tone="warning" title="Brevo is not connected">
          {stats.detail ??
            'BREVO_API_KEY is not set on the brevo-stats function, so email performance has not been read.'}
        </Alert>
      ) : null}

      {stats.state === 'failed' ? (
        <Alert tone="danger" title="Could not read Brevo">
          {stats.detail} The figures below are missing rather than zero.
        </Alert>
      ) : null}

      <section aria-labelledby="transactional-heading" className="flex flex-col gap-3">
        <h2 id="transactional-heading" className="text-sm font-semibold text-text-primary">
          Transactional email
        </h2>
        <p className="text-xs text-text-caption">
          Covers the welcome email, the results ready email that invites a Trustpilot review, and
          the newsletter confirmation. Supabase auth mail is relayed through Brevo SMTP and appears
          here too.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Requests" value={s?.requests ?? null} hint="Emails handed to Brevo" />
          <Stat label="Delivered" value={s?.delivered ?? null} hint="Accepted by the recipient" />
          <Stat label="Unique opens" value={s?.uniqueOpens ?? null} hint="Distinct recipients" />
          <Stat label="Unique clicks" value={s?.uniqueClicks ?? null} hint="Distinct recipients" />
          <Stat label="Hard bounces" value={s?.hardBounces ?? null} hint="Permanent failures" />
          <Stat label="Soft bounces" value={s?.softBounces ?? null} hint="Temporary failures" />
          <Stat label="Blocked" value={s?.blocked ?? null} hint="Suppressed before sending" />
          <Stat label="Spam reports" value={s?.spamReports ?? null} hint="Marked as spam" />
        </div>

        {deliveryRate !== null || openRate !== null ? (
          <p className="tabular text-sm text-text-secondary">
            {deliveryRate !== null ? `Delivery rate ${formatPercent(deliveryRate)}. ` : ''}
            {openRate !== null ? `Open rate ${formatPercent(openRate)} of delivered.` : ''}
          </p>
        ) : null}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Newsletter list</CardTitle>
          <p className="text-xs text-text-caption">
            Brevo owns the sending list; this database owns the consent record. They should agree.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Stat
              label="Active in this database"
              value={ourActive}
              hint="newsletter_subscribers, status active"
            />
            <Stat
              label="Subscribers in Brevo"
              value={theirTotal}
              hint={list.data?.name ? `List: ${list.data.name}` : 'Brevo list total'}
            />
          </div>
          {list.state !== 'ok' ? (
            <p className="text-xs text-text-caption">{list.detail}</p>
          ) : listsDisagree ? (
            <Alert tone="warning" title="The two counts disagree">
              This database has {formatNumber(ourActive ?? 0)} active and Brevo reports{' '}
              {formatNumber(theirTotal ?? 0)}. Neither has been changed. A difference usually means
              a contact was added or removed directly in Brevo, where the unsubscribe webhook keeps
              only opt-outs in step.
            </Alert>
          ) : (
            <p className="text-xs text-success-deep">The two counts agree.</p>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Campaigns</CardTitle>
          <p className="text-xs text-text-caption">
            Newsletter issues are composed in Brevo, so this is the only place their performance
            exists.
          </p>
        </CardHeader>
        {campaigns.state === 'ok' ? (
          <DataTable
            rows={campaigns.data ?? []}
            columns={campaignColumns}
            getKey={(c) => String(c.id ?? c.name)}
            caption="Brevo campaigns"
            emptyTitle="No campaigns in Brevo"
            emptyDescription="Nothing has been sent as a campaign yet."
          />
        ) : (
          <CardContent>
            <p className="text-sm text-text-caption">{campaigns.detail}</p>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
