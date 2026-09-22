import { requireAdmin } from '@/server/auth'
import { serviceClient } from '@/server/supabase'
import { csvResponse, EXPORT_LIMIT, exportFailed, recordExport } from '../csvResponse'

export const dynamic = 'force-dynamic'

// The anonymised research dataset, as a CSV. Every column here comes from the
// research_checks view (migration 20260922230000), which is built only from
// users whose research consent is live and carries no identifier: no user id,
// email, name, employer, job description or CV, dates reduced to the month and
// experience in bands.
//
// This is the one export in this app whose file is meant to leave the company,
// which is exactly why it reads the view rather than the tables. Widening it
// means changing the view, in a migration, against the consent wording in
// src/lib/researchConsent.ts.
export async function GET() {
  const { admin } = await requireAdmin()

  const { data, error } = await serviceClient()
    .from('research_checks')
    .select('*')
    .order('check_month', { ascending: false })
    .limit(EXPORT_LIMIT)

  if (error) {
    await recordExport(admin, 'research', { error })
    return exportFailed()
  }

  const rows = data ?? []
  await recordExport(admin, 'research', { rows: rows.length, filtered: false })

  return csvResponse('research', rows, [
    { header: 'Month', value: (r) => r.check_month },
    { header: 'Role', value: (r) => r.job_title },
    { header: 'Score', value: (r) => r.score },
    { header: 'Experience score', value: (r) => r.experience_score },
    { header: 'Skills score', value: (r) => r.skills_score },
    { header: 'Value score', value: (r) => r.uvp_score },
    { header: 'Report language', value: (r) => r.output_language },
    { header: 'Level', value: (r) => r.seniority },
    { header: 'Country', value: (r) => r.country },
    { header: 'Experience band', value: (r) => r.experience_band },
    { header: 'Industry', value: (r) => r.industry },
    { header: 'Employment status', value: (r) => r.employment_status },
    { header: 'Education', value: (r) => r.education_level },
    { header: 'Needs work permit', value: (r) => r.needs_work_permit },
    { header: 'Applied', value: (r) => r.applied },
    { header: 'Application channel', value: (r) => r.application_channel },
    { header: 'Application stage', value: (r) => r.application_stage },
    { header: 'Days to reply', value: (r) => r.days_to_reply },
    { header: 'Salary offered', value: (r) => r.salary_offered },
    { header: 'Salary currency', value: (r) => r.salary_currency },
    { header: 'Salary country', value: (r) => r.salary_country },
  ])
}
