import { randomUUID } from 'node:crypto'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/server/auth'
import { writeAuditLog } from '@/server/audit'
import { serviceClient } from '@/server/supabase'
import { getCheckReport } from '@/server/queries/report'
import { canViewReports, isCheckId, reportViewAuditEntry } from '@/lib/report'
import { safeErrorSummary } from '@/lib/redact'
import { formatDateTime } from '@/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge, checkStatusTone } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/States'
import { PageHeader } from '@/components/dashboard/PageHeader'

export const dynamic = 'force-dynamic'

// Read-only quality review of what a candidate was shown. Approved by the
// Decision Log entry "Control Centre: read-only access to check reports for
// quality review" (16 September 2026). Every load is written to the audit log,
// successful or not, and the log row carries the check id only.
export default async function CheckReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { admin, timezone } = await requireAdmin()
  const { id } = await params
  const entry = reportViewAuditEntry(id)
  const correlationId = randomUUID()

  // Refusals are audited too: an attempt to read a report is worth finding
  // later whether or not it succeeded. notFound() rather than a message, so the
  // page does not confirm to a non-owner that reports are readable here.
  if (!canViewReports(admin.role)) {
    await writeAuditLog(admin, entry, 'failure', correlationId, 'role not permitted')
    notFound()
  }
  if (!isCheckId(id)) {
    await writeAuditLog(admin, entry, 'failure', correlationId, 'malformed check id')
    notFound()
  }

  let report
  try {
    report = await getCheckReport(serviceClient(), id)
  } catch (caught) {
    await writeAuditLog(admin, entry, 'failure', correlationId, safeErrorSummary(caught))
    throw caught
  }

  if (!report) {
    await writeAuditLog(admin, entry, 'failure', correlationId, 'check not found')
    notFound()
  }

  await writeAuditLog(admin, entry, 'success', correlationId)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Report: ${report.jobTitle ?? 'Untitled check'}`}
        description={report.companyName ?? undefined}
        actions={<Badge tone={checkStatusTone(report.status)}>{report.status}</Badge>}
      />

      <p className="text-xs text-text-caption">
        Read only. This view is recorded in the audit log. Do not copy report text or the job
        description out of this page.
      </p>

      <div className="flex flex-wrap items-center gap-6 text-sm">
        <Link href={`/checks/${report.checkId}`} className="text-blue hover:underline">
          Back to check
        </Link>
        {report.email ? (
          <Link href={`/users/${report.userId}`} className="text-blue hover:underline">
            {report.email}
          </Link>
        ) : null}
        <span className="text-text-caption">{formatDateTime(report.createdAt, timezone)}</span>
        <span>
          Score <span className="tabular font-semibold">{report.score ?? '-'}</span>
        </span>
      </div>

      {report.hasReport ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Section title="Strengths" items={report.strengths} />
          <Section title="Improvements" items={report.improvements} />
          <Section title="Prospects" items={report.prospects} />
        </div>
      ) : (
        <Card>
          <CardContent>
            <EmptyState
              title="No report stored"
              description="This check has no generated report, usually because it did not complete."
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>What the user said</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {report.userFeedback.length === 0 ? (
            <EmptyState title="No feedback left on this check" />
          ) : (
            <ul className="divide-y divide-border">
              {report.userFeedback.map((item, index) => (
                <li key={index} className="flex flex-col gap-1 px-5 py-3 text-sm">
                  <span className="font-medium">Rating {item.rating} of 5</span>
                  {item.comment ? <p className="whitespace-pre-wrap">{item.comment}</p> : null}
                  <span className="text-xs text-text-caption">
                    {formatDateTime(item.createdAt, timezone)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Job description</CardTitle>
        </CardHeader>
        <CardContent>
          {report.jobDescription.trim() ? (
            <p className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap text-sm">
              {report.jobDescription}
            </p>
          ) : (
            <EmptyState title="No job description stored" />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-text-caption">None in this report.</p>
        ) : (
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm">
            {items.map((item, index) => (
              <li key={index} className="whitespace-pre-wrap">
                {item}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
