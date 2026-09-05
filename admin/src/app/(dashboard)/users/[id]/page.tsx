import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/server/auth'
import { serviceClient } from '@/server/supabase'
import { getUserDetail } from '@/server/queries/users'
import { formatDateTime, formatMoney, formatRelative } from '@/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge, checkStatusTone } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/States'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { SupportNoteForm } from '../../support/SupportNoteForm'

export const dynamic = 'force-dynamic'

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { timezone } = await requireAdmin()
  const { id } = await params
  const now = new Date()

  const detail = await getUserDetail(serviceClient(), id)
  if (!detail) notFound()

  const { profile, auth, checks, batches, ledger, refunds, notes } = detail

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={profile.email}
        description={profile.full_name ?? undefined}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Signed up" value={formatDateTime(profile.created_at, timezone)} />
        <Stat
          label="Verified"
          value={auth?.email_confirmed_at ? 'Yes' : 'No'}
          detail={auth?.email_confirmed_at ? formatDateTime(auth.email_confirmed_at, timezone) : undefined}
        />
        <Stat label="Last active" value={formatRelative(auth?.last_sign_in_at ?? null, now)} />
        <Stat
          label="Credit balance"
          value={String(profile.checks_balance)}
          detail={`${profile.lifetime_checks_consumed} used lifetime`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Checks</CardTitle>
          <p className="text-xs text-text-caption">
            CV contents are never shown. A purged file is recorded as deleted, not restored.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {checks.length === 0 ? (
            <EmptyState title="No checks yet" />
          ) : (
            <ul className="divide-y divide-border">
              {checks.map((check) => (
                <li key={check.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <Badge tone={checkStatusTone(check.status)}>{check.status}</Badge>
                  <Link href={`/checks/${check.id}`} className="min-w-0 flex-1 text-sm">
                    <span className="font-medium text-blue hover:underline">
                      {check.job_title ?? 'Untitled check'}
                    </span>
                    {check.company_name ? (
                      <span className="text-text-caption"> · {check.company_name}</span>
                    ) : null}
                  </Link>
                  <span className="text-xs text-text-caption">
                    {formatDateTime(check.created_at, timezone)}
                  </span>
                  <Badge tone={check.uploads_purged ? 'neutral' : 'info'}>
                    {check.uploads_purged
                      ? `File deleted ${check.uploads_purged_at ? formatDateTime(check.uploads_purged_at, timezone) : ''}`
                      : 'File retained'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Purchases and credit batches</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {batches.length === 0 ? (
            <EmptyState title="No purchases" />
          ) : (
            <ul className="divide-y divide-border">
              {batches.map((batch) => (
                <li key={batch.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <Badge tone={batch.refund_status === 'active' ? 'success' : 'warning'}>
                    {batch.refund_status}
                  </Badge>
                  <span className="font-medium">{batch.pack_id ?? batch.source}</span>
                  <span className="tabular text-text-secondary">
                    {batch.checks_remaining} of {batch.checks_granted} remaining
                  </span>
                  {batch.amount_paid !== null && batch.currency ? (
                    <span className="tabular text-text-secondary">
                      {formatMoney(batch.amount_paid, batch.currency)}
                    </span>
                  ) : null}
                  <span className="ml-auto text-xs text-text-caption">
                    {batch.paid_at ? formatDateTime(batch.paid_at, timezone) : 'not a purchase'}
                    {batch.expires_at ? ` · expires ${formatDateTime(batch.expires_at, timezone)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Credit ledger</CardTitle>
          <p className="text-xs text-text-caption">
            Immutable. Every movement, most recent first.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {ledger.length === 0 ? (
            <EmptyState title="No ledger entries" />
          ) : (
            <ul className="divide-y divide-border">
              {ledger.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
                  <Badge tone={entry.amount >= 0 ? 'success' : 'neutral'}>{entry.entry_type}</Badge>
                  <span className="text-text-caption">{entry.credit_type}</span>
                  <span className="tabular font-medium">
                    {entry.amount > 0 ? '+' : ''}
                    {entry.amount}
                  </span>
                  {entry.note ? <span className="text-text-secondary">{entry.note}</span> : null}
                  <span className="ml-auto text-xs text-text-caption">
                    {formatDateTime(entry.created_at, timezone)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {refunds.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Refunds</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {refunds.map((refund) => (
                <li key={refund.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <Badge
                    tone={
                      refund.status === 'succeeded'
                        ? 'success'
                        : refund.status === 'failed'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {refund.status}
                  </Badge>
                  {refund.reason ? (
                    <span className="text-text-secondary">{refund.reason}</span>
                  ) : null}
                  <span className="ml-auto text-xs text-text-caption">
                    {formatDateTime(refund.created_at, timezone)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Support notes</CardTitle>
          <p className="text-xs text-text-caption">Internal only. Never shown to the customer.</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SupportNoteForm userId={profile.id} />
          {notes.length === 0 ? (
            <p className="text-sm text-text-secondary">No notes yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {notes.map((note) => (
                <li key={note.id} className="rounded-[16px] border border-border bg-background p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge tone={note.status === 'resolved' ? 'success' : 'warning'}>
                      {note.status}
                    </Badge>
                    <Badge>{note.category}</Badge>
                    <span className="ml-auto text-xs text-text-caption">
                      {formatDateTime(note.created_at, timezone)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-text-primary">{note.body}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="rounded-[20px] border border-border-soft bg-surface px-5 py-4 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wide text-text-caption">{label}</p>
      <p className="mt-1 text-lg font-semibold text-text-primary">{value}</p>
      {detail ? <p className="text-xs text-text-caption">{detail}</p> : null}
    </div>
  )
}
