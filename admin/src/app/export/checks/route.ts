import { requireAdmin } from '@/server/auth'
import { serviceClient } from '@/server/supabase'
import { csvResponse, EXPORT_LIMIT } from '../csvResponse'

export const dynamic = 'force-dynamic'

interface Row {
  id: string
  user_id: string
  job_title: string | null
  company_name: string | null
  status: string
  created_at: string
  funding_pack_id: string | null
  uploads_purged: boolean
  uploads_purged_at: string | null
  interview_probability_score: number | null
  profiles: { email: string } | null
}

export async function GET() {
  await requireAdmin()

  // No job_description, no cv_file_name, no cv_storage_path, and none of the
  // scoring internals. An export leaves the machine, so what it may contain is
  // decided here rather than at the point of download.
  const { data, error } = await serviceClient()
    .from('checks')
    .select(
      'id, user_id, job_title, company_name, status, created_at, funding_pack_id, uploads_purged, uploads_purged_at, interview_probability_score, profiles!inner(email)',
    )
    .order('created_at', { ascending: false })
    .limit(EXPORT_LIMIT)

  if (error) return new Response(`Export failed: ${error.message}`, { status: 500 })

  const rows = (data ?? []) as unknown as Row[]

  return csvResponse('application-checks', rows, [
    { header: 'Check ID', value: (r) => r.id },
    { header: 'User email', value: (r) => r.profiles?.email ?? '' },
    { header: 'Job title', value: (r) => r.job_title },
    { header: 'Company', value: (r) => r.company_name },
    { header: 'Status', value: (r) => r.status },
    { header: 'Created', value: (r) => r.created_at },
    { header: 'Funded by', value: (r) => r.funding_pack_id ?? 'free' },
    { header: 'Score', value: (r) => r.interview_probability_score },
    { header: 'CV deleted', value: (r) => (r.uploads_purged ? 'yes' : 'no') },
    { header: 'CV deleted at', value: (r) => r.uploads_purged_at },
  ])
}
