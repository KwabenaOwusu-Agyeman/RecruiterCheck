import 'server-only'
import { normaliseReportSection } from '@/lib/report'
import type { Db } from '../supabase'
import type { CheckRow } from '@/types/db'

export interface CheckReport {
  checkId: string
  userId: string
  email: string | null
  jobTitle: string | null
  companyName: string | null
  status: CheckRow['status']
  createdAt: string
  score: number | null
  jobDescription: string
  strengths: string[]
  improvements: string[]
  prospects: string[]
  hasReport: boolean
  userFeedback: { rating: number; comment: string | null; createdAt: string }[]
}

/**
 * Loads what the candidate was shown, for the read-only quality review page.
 *
 * Still excluded, as everywhere else in this app: the CV (cv_storage_path,
 * cv_file_name), generated documents, and the scoring internals in
 * check_score_audits. The user's own feedback is selected without their email
 * or display name, which the page does not need.
 *
 * job_description is read here and nowhere else in this app. It stays on
 * redact()'s deny list, so it still cannot reach a log or an export.
 */
export async function getCheckReport(db: Db, checkId: string): Promise<CheckReport | null> {
  const { data: check, error } = await db
    .from('checks')
    .select(
      'id, user_id, job_title, company_name, status, created_at, interview_probability_score, job_description, profiles!inner(email)',
    )
    .eq('id', checkId)
    .maybeSingle()

  if (error) throw error
  if (!check) return null

  const [{ data: feedback, error: feedbackError }, { data: ratings, error: ratingsError }] =
    await Promise.all([
      db
        .from('feedback')
        .select('strengths, improvements, prospects')
        .eq('check_id', checkId)
        .maybeSingle(),
      db
        .from('product_feedback')
        .select('rating, comment, created_at')
        .eq('check_id', checkId)
        .order('created_at', { ascending: false }),
    ])

  if (feedbackError) throw feedbackError
  if (ratingsError) throw ratingsError

  const email = (check as unknown as { profiles: { email: string } | null }).profiles?.email ?? null

  return {
    checkId: check.id,
    userId: check.user_id,
    email,
    jobTitle: check.job_title,
    companyName: check.company_name,
    status: check.status,
    createdAt: check.created_at,
    score: check.interview_probability_score,
    jobDescription: check.job_description,
    strengths: normaliseReportSection(feedback?.strengths),
    improvements: normaliseReportSection(feedback?.improvements),
    prospects: normaliseReportSection(feedback?.prospects),
    hasReport: Boolean(feedback),
    userFeedback: (ratings ?? []).map((row) => ({
      rating: row.rating,
      comment: row.comment,
      createdAt: row.created_at,
    })),
  }
}
