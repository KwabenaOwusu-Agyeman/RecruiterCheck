import { requireAdmin } from '@/server/auth'
import { serviceClient } from '@/server/supabase'
import { loadAudience } from '@/server/metrics/marketing'
import { loadProfileBasics } from '@/server/metrics/profileBasics'
import { loadResearchConsent } from '@/server/metrics/research'
import { resolvePeriod } from '@/lib/time'
import { parseCustomRange, parsePeriod } from '@/lib/params'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { ButtonLink } from '@/components/ui/Button'
import { BreakdownList } from '@/components/dashboard/BreakdownList'
import { Alert, ErrorState } from '@/components/ui/States'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { PeriodPicker } from '../PeriodPicker'
import { RefreshButton } from '../RefreshButton'

export const dynamic = 'force-dynamic'

export default async function AudiencePage({
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

  const db = serviceClient()
  const [data, profileBasics, research] = await Promise.all([
    loadAudience(db, period),
    loadProfileBasics(db),
    loadResearchConsent(db),
  ])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audience"
        description="The newsletter list, the social proof pipeline and review invitations."
        actions={<RefreshButton />}
      />

      <PeriodPicker active={periodId} />

      {data.error ? <ErrorState title="Could not load audience metrics" detail={data.error} /> : null}

      <section aria-labelledby="newsletter-heading" className="flex flex-col gap-3">
        <h2 id="newsletter-heading" className="text-sm font-semibold text-text-primary">
          Newsletter
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total subscribers"
            metric={data.newsletterTotal}
            hint="Lifetime, not scoped to the period"
          />
          <MetricCard label="Active" metric={data.newsletterActive} hint="Still subscribed" />
          <MetricCard
            label="Unsubscribed"
            metric={data.newsletterUnsubscribed}
            higherIsWorse
            hint="Opted out, here or through Brevo"
          />
          <MetricCard
            label="Joined in period"
            metric={data.newsletterJoinedInPeriod}
            hint="By consent date"
          />
        </div>

        <Alert tone="info" title="There is no signup form on the site">
          subscribeToNewsletter exists in the code but nothing calls it, so the list can only grow
          from out of band additions. That is worth knowing before reading the growth figure as a
          marketing result.
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>By consent source</CardTitle>
            <p className="text-xs text-text-caption">
              Where consent was given. This is consent provenance, not marketing attribution.
            </p>
          </CardHeader>
          <CardContent>
            <BreakdownList rows={data.byConsentSource} emptyTitle="No subscribers yet" />
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="research-heading" className="flex flex-col gap-3">
        <h2 id="research-heading" className="text-sm font-semibold text-text-primary">
          Research consent
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Consented" metric={research.active} hint="Live consents, not withdrawn" />
          <MetricCard label="Withdrawn" metric={research.withdrawn} higherIsWorse />
          <MetricCard
            label="Checks in the dataset"
            metric={research.checksInDataset}
            hint="Completed checks the export would include"
          />
        </div>

        <Alert tone="info" title="What the export contains">
          Anonymised rows only: month, role, scores, and the profile and outcome answers those users
          gave. No name, email, employer, job description or CV, and no free text. Every download is
          written to the audit log.
        </Alert>

        <div>
          <ButtonLink href="/export/research">Export research CSV</ButtonLink>
        </div>
      </section>

      <section aria-labelledby="profile-basics-heading" className="flex flex-col gap-3">
        <h2 id="profile-basics-heading" className="text-sm font-semibold text-text-primary">
          Who uses the product
        </h2>
        {!profileBasics.ok ? (
          <ErrorState title="Could not load profile details" detail={profileBasics.reason} />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Profiles saved"
                metric={profileBasics.summary.saved}
                hint="Users who added details in Account settings"
              />
            </div>

            <Alert tone="info" title="Optional and self reported">
              These details are only here because a user chose to add them, and every question can
              be left blank. Each breakdown counts only the people who answered it, so the totals
              differ between them. Counts only: no row is shown here.
            </Alert>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Level</CardTitle>
                </CardHeader>
                <CardContent>
                  <BreakdownList rows={profileBasics.summary.bySeniority} emptyTitle="Nobody has said yet" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Years of experience</CardTitle>
                </CardHeader>
                <CardContent>
                  <BreakdownList rows={profileBasics.summary.byExperience} emptyTitle="Nobody has said yet" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Where they are looking</CardTitle>
                </CardHeader>
                <CardContent>
                  <BreakdownList rows={profileBasics.summary.byCountry} emptyTitle="Nobody has said yet" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Industry</CardTitle>
                </CardHeader>
                <CardContent>
                  <BreakdownList rows={profileBasics.summary.byIndustry} emptyTitle="Nobody has said yet" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Employment status</CardTitle>
                </CardHeader>
                <CardContent>
                  <BreakdownList rows={profileBasics.summary.byEmployment} emptyTitle="Nobody has said yet" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Highest education</CardTitle>
                </CardHeader>
                <CardContent>
                  <BreakdownList rows={profileBasics.summary.byEducation} emptyTitle="Nobody has said yet" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Work permit</CardTitle>
                </CardHeader>
                <CardContent>
                  <BreakdownList rows={profileBasics.summary.needsWorkPermit} emptyTitle="Nobody has said yet" />
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="proof-heading" className="flex flex-col gap-3">
        <h2 id="proof-heading" className="text-sm font-semibold text-text-primary">
          Social proof
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Testimonials"
            metric={data.testimonials}
            hint="Submitted in this period"
          />
          <MetricCard
            label="Average rating"
            metric={data.averageRating}
            render={(v) => `${Math.round(v * 10) / 10} of 5`}
            hint="Across feedback in this period"
          />
          <MetricCard
            label="Thumbs up"
            metric={data.sentimentPositive}
            hint="Positive sentiment on a result"
          />
          <MetricCard
            label="Thumbs down"
            metric={data.sentimentNegative}
            higherIsWorse
            hint="Negative sentiment on a result"
          />
        </div>

        <Alert tone="info" title="Testimonials are structurally positive">
          The form is only offered after a thumbs up, and every stored row has already consented to
          publication. The average rating therefore describes people who liked the result, not the
          whole user base.
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>Rating distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownList rows={data.ratingDistribution} emptyTitle="No feedback in this period" />
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="reviews-heading" className="flex flex-col gap-3">
        <h2 id="reviews-heading" className="text-sm font-semibold text-text-primary">
          Reviews
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <MetricCard
            label="Trustpilot invitations sent"
            metric={data.trustpilotInvites}
            hint="Results emails that BCC'd Trustpilot"
          />
        </div>
        <Alert tone="info" title="Invitations sent, not reviews received">
          Whether anyone actually left a review lives in Trustpilot. Nothing about review outcomes
          reaches this database, so that figure cannot be shown here.
        </Alert>
      </section>
    </div>
  )
}
