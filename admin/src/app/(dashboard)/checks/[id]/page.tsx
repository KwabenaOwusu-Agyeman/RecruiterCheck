import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/server/auth'
import { serviceClient } from '@/server/supabase'
import { formatDateTime, formatDuration } from '@/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge, checkStatusTone } from '@/components/ui/Badge'
import { Alert, EmptyState } from '@/components/ui/States'
import { PageHeader } from '@/components/dashboard/PageHeader'

export const dynamic = 'force-dynamic'

export default async function CheckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { timezone } = await requireAdmin()
  const { id } = await params
  const db = serviceClient()

  // job_description, cv_storage_path and cv_file_name are deliberately absent
  // from this select. Diagnosing a check needs its status, timings and error,
  // never the candidate's document.
  const { data: check } = await db
    .from('checks')
    .select(
      'id, user_id, job_title, company_name, status, created_at, updated_at, detected_language, output_language, funding_pack_id, error_message, uploads_purged, uploads_purged_at, documents_purged, documents_purged_at, upload_purge_attempts, interview_probability_score, profiles!inner(email)',
    )
    .eq('id', id)
    .maybeSingle()

  if (!check) notFound()

  const [{ data: audit }, { data: ledger }, { data: purgeLog }] = await Promise.all([
    // Only the timing and model identity are selected. subcriteria,
    // category_totals, evidence_references and the rubric and prompt versions
    // are the confidential scoring internals and are never read into this app.
    db
      .from('check_score_audits')
      .select('calculated_at, model_identifier, final_score')
      .eq('check_id', id)
      .maybeSingle(),
    db
      .from('check_ledger')
      .select('id, entry_type, credit_type, amount, note, created_at')
      .eq('related_check_id', id)
      .order('created_at', { ascending: false }),
    db
      .from('upload_purge_log')
      .select('id, attempted_at, success, attempt_number')
      .eq('check_id', id)
      .order('attempted_at', { ascending: false }),
  ])

  const email = (check as unknown as { profiles: { email: string } | null }).profiles?.email
  const processingSeconds = audit?.calculated_at
    ? (new Date(audit.calculated_at).getTime() - new Date(check.created_at).getTime()) / 1000
    : null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={check.job_title ?? 'Untitled check'}
        description={check.company_name ?? undefined}
        actions={<Badge tone={checkStatusTone(check.status)}>{check.status}</Badge>}
      />

      {check.status === 'failed' && check.error_message ? (
        <Alert tone="danger" title="This check failed">
          <p className="font-mono text-xs">{check.error_message}</p>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="User"
          value={email ?? 'unknown'}
          href={`/users/${check.user_id}`}
        />
        <Stat label="Created" value={formatDateTime(check.created_at, timezone)} />
        <Stat
          label="Completed"
          value={audit?.calculated_at ? formatDateTime(audit.calculated_at, timezone) : 'not completed'}
          detail={
            processingSeconds !== null ? `took ${formatDuration(processingSeconds)}` : undefined
          }
        />
        <Stat label="Funded by" value={check.funding_pack_id ?? 'Free check'} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Result</CardTitle>
          <p className="text-xs text-text-caption">
            The score only. Scoring weights, sub-criteria and prompts are confidential and are not
            read by this dashboard.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-8">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-caption">Score</p>
            <p className="tabular text-3xl font-semibold">
              {check.interview_probability_score ?? '-'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-text-caption">Model</p>
            <p className="text-sm">{audit?.model_identifier ?? 'not recorded'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-text-caption">Language</p>
            <p className="text-sm">
              {check.output_language}
              {check.detected_language ? ` (detected ${check.detected_language})` : ''}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>File retention</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            <Badge tone={check.uploads_purged ? 'neutral' : 'info'}>
              {check.uploads_purged ? 'CV deleted' : 'CV retained'}
            </Badge>{' '}
            {check.uploads_purged_at
              ? `on ${formatDateTime(check.uploads_purged_at, timezone)}`
              : 'awaiting the 24 hour purge'}
          </p>
          <p>
            <Badge tone={check.documents_purged ? 'neutral' : 'info'}>
              {check.documents_purged ? 'Documents deleted' : 'Documents retained'}
            </Badge>{' '}
            {check.documents_purged_at
              ? `on ${formatDateTime(check.documents_purged_at, timezone)}`
              : ''}
          </p>
          {check.upload_purge_attempts > 0 ? (
            <p className="text-text-caption">
              {check.upload_purge_attempts} purge attempt
              {check.upload_purge_attempts === 1 ? '' : 's'} recorded.
            </p>
          ) : null}
          {(purgeLog ?? []).length > 0 ? (
            <ul className="mt-1 flex flex-col gap-1 text-xs text-text-caption">
              {(purgeLog ?? []).map((entry) => (
                <li key={entry.id}>
                  Attempt {entry.attempt_number}: {entry.success ? 'succeeded' : 'failed'} at{' '}
                  {formatDateTime(entry.attempted_at, timezone)}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-1 text-xs text-text-caption">
            A deleted file stays deleted. This dashboard records that it went and when, and has no
            way to restore it.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Credit transaction</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(ledger ?? []).length === 0 ? (
            <EmptyState
              title="No ledger entry"
              description="A free check consumes the lifetime allowance rather than a credit batch, so it has no ledger row."
            />
          ) : (
            <ul className="divide-y divide-border">
              {(ledger ?? []).map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <Badge tone={entry.amount >= 0 ? 'success' : 'neutral'}>{entry.entry_type}</Badge>
                  <span className="text-text-caption">{entry.credit_type}</span>
                  <span className="tabular font-medium">
                    {entry.amount > 0 ? '+' : ''}
                    {entry.amount}
                  </span>
                  <span className="ml-auto text-xs text-text-caption">
                    {formatDateTime(entry.created_at, timezone)}
                  </span>
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
  href,
}: {
  label: string
  value: string
  detail?: string
  href?: string
}) {
  return (
    <div className="rounded-[20px] border border-border-soft bg-surface px-5 py-4 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wide text-text-caption">{label}</p>
      {href ? (
        <Link href={href} className="mt-1 block truncate text-lg font-semibold text-blue hover:underline">
          {value}
        </Link>
      ) : (
        <p className="mt-1 truncate text-lg font-semibold text-text-primary">{value}</p>
      )}
      {detail ? <p className="text-xs text-text-caption">{detail}</p> : null}
    </div>
  )
}
