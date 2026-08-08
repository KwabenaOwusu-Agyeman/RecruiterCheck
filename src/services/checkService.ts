import { supabase } from '@/lib/supabase'
import type {
  Check,
  CheckWithFeedback,
  Feedback,
  OutputLanguage,
  Profile,
  ProductFeedback,
  Subscription,
} from '@/types'

export interface DraftCheckUpdate {
  jobTitle?: string
  companyName?: string
  jobDescription?: string
  outputLanguage?: OutputLanguage
}

function mapProfile(row: Profile): Profile {
  return row
}

function mapCheck(row: Check): Check {
  return row
}

function mapFeedback(row: Feedback): Feedback {
  return {
    ...row,
    strengths: Array.isArray(row.strengths) ? row.strengths : [],
    improvements: Array.isArray(row.improvements) ? row.improvements : [],
    prospects: Array.isArray(row.prospects) ? row.prospects : [],
  }
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data ? mapProfile(data as Profile) : null
}

export async function updateProfile(
  userId: string,
  updates: Pick<Profile, 'full_name'>,
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select('*')
    .single()

  if (error) throw error
  return mapProfile(data as Profile)
}

export async function getSubscription(userId: string): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data as Subscription | null
}

export async function getProductFeedback(userId: string): Promise<ProductFeedback | null> {
  const { data, error } = await supabase
    .from('product_feedback')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data as ProductFeedback | null
}

export async function submitProductFeedback(
  userId: string,
  email: string,
  rating: number,
  comment: string,
): Promise<ProductFeedback> {
  const { data, error } = await supabase
    .from('product_feedback')
    .insert({ user_id: userId, email, rating, comment: comment.trim() || null })
    .select('*')
    .single()

  if (error) throw error
  return data as ProductFeedback
}

export async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account', { body: {} })

  if (error) throw error
  if (data?.error) throw new Error(String(data.error))
}

export async function getChecks(userId: string): Promise<Check[]> {
  const { data, error } = await supabase
    .from('checks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => mapCheck(row as Check))
}

export async function getCheckWithFeedback(checkId: string): Promise<CheckWithFeedback | null> {
  const { data, error } = await supabase
    .from('checks')
    .select('*, feedback(*)')
    .eq('id', checkId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const row = data as unknown as Check & { feedback: Feedback[] | Feedback | null }
  const feedbackRows = row.feedback
  const feedback = Array.isArray(feedbackRows)
    ? feedbackRows[0] ?? null
    : feedbackRows

  return {
    ...mapCheck(row),
    feedback: feedback ? mapFeedback(feedback) : null,
  }
}

const FREE_TIER_LIFETIME_LIMIT = 1
export const PAID_TIER_DAILY_LIMIT = 8

export type CheckGateReason = 'free-tier' | 'daily-limit' | null

/**
 * Free tier: 1 completed check ever, per the locked spec. Premium tiers
 * (weekly/monthly) are capped at 8 checks per UTC day — not a monetization
 * lever, just reinforcing the "quality over quantity" positioning even for
 * paying users. Draft checks never count toward either allowance; the free
 * tier only counts completed ones, the daily cap counts anything submitted
 * (draft excluded) since it's meant to limit submission volume, not outcomes.
 */
export function getCheckGateReason(profile: Profile, checks: Check[]): CheckGateReason {
  if (profile.subscription_tier === 'free') {
    const completedCount = checks.filter((check) => check.status === 'completed').length
    return completedCount < FREE_TIER_LIFETIME_LIMIT ? null : 'free-tier'
  }

  const startOfDayUtc = new Date()
  startOfDayUtc.setUTCHours(0, 0, 0, 0)
  const todaysCount = checks.filter(
    (check) => check.status !== 'draft' && new Date(check.created_at) >= startOfDayUtc,
  ).length
  return todaysCount < PAID_TIER_DAILY_LIMIT ? null : 'daily-limit'
}

/**
 * Count-only query (no rows fetched) for showing "X of 8 today" in the
 * account UI, so paid-tier users can see the daily cap before they hit it
 * instead of discovering it only when blocked.
 */
export async function getTodaysCheckCount(userId: string): Promise<number> {
  const startOfDayUtc = new Date()
  startOfDayUtc.setUTCHours(0, 0, 0, 0)

  const { count, error } = await supabase
    .from('checks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .neq('status', 'draft')
    .gte('created_at', startOfDayUtc.toISOString())

  if (error) throw error
  return count ?? 0
}

export async function getCheck(checkId: string): Promise<Check | null> {
  const { data, error } = await supabase
    .from('checks')
    .select('*')
    .eq('id', checkId)
    .maybeSingle()

  if (error) throw error
  return data ? mapCheck(data as Check) : null
}

/**
 * Creates the draft row as soon as a CV is attached, per the locked spec
 * ("New Check creates a draft row immediately on CV upload"). Job description
 * may still be empty at this point — the draft is filled in via updateDraftCheck.
 */
export async function createDraftCheck(userId: string, cvFile: File): Promise<Check> {
  const fileExt = cvFile.name.split('.').pop() ?? 'pdf'
  const checkId = crypto.randomUUID()
  const storagePath = `${userId}/${checkId}.${fileExt}`

  const { error: uploadError } = await supabase.storage
    .from('cvs')
    .upload(storagePath, cvFile, {
      upsert: false,
      contentType: cvFile.type,
    })

  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('checks')
    .insert({
      id: checkId,
      user_id: userId,
      cv_storage_path: storagePath,
      cv_file_name: cvFile.name,
      status: 'draft',
    })
    .select('*')
    .single()

  if (error) throw error
  return mapCheck(data as Check)
}

export async function updateDraftCheck(
  checkId: string,
  updates: DraftCheckUpdate,
): Promise<Check> {
  const payload: {
    job_title?: string | null
    company_name?: string | null
    job_description?: string
    output_language?: OutputLanguage
  } = {}
  if (updates.jobTitle !== undefined) payload.job_title = updates.jobTitle.trim() || null
  if (updates.companyName !== undefined) payload.company_name = updates.companyName.trim() || null
  if (updates.jobDescription !== undefined) payload.job_description = updates.jobDescription
  if (updates.outputLanguage !== undefined) payload.output_language = updates.outputLanguage

  const { data, error } = await supabase
    .from('checks')
    .update(payload)
    .eq('id', checkId)
    .eq('status', 'draft')
    .select('*')
    .single()

  if (error) throw error
  return mapCheck(data as Check)
}

export async function replaceDraftCv(
  checkId: string,
  userId: string,
  cvFile: File,
): Promise<Check> {
  const fileExt = cvFile.name.split('.').pop() ?? 'pdf'
  const storagePath = `${userId}/${checkId}-${Date.now()}.${fileExt}`

  const { error: uploadError } = await supabase.storage
    .from('cvs')
    .upload(storagePath, cvFile, {
      upsert: false,
      contentType: cvFile.type,
    })

  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('checks')
    .update({ cv_storage_path: storagePath, cv_file_name: cvFile.name })
    .eq('id', checkId)
    .eq('status', 'draft')
    .select('*')
    .single()

  if (error) throw error
  return mapCheck(data as Check)
}

export async function analyzeCheck(checkId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('analyze-check', {
    body: { checkId },
  })

  if (error) throw error
  if (data?.error) throw new Error(String(data.error))
}

export interface GeneratedDocuments {
  cv: string
  coverLetter: string
  emailForRecruiter: string
  zip: string
}

export async function generateDocuments(checkId: string): Promise<GeneratedDocuments> {
  const { data, error } = await supabase.functions.invoke('generate-documents', {
    body: { checkId },
  })

  if (error) throw error
  if (data?.error) throw new Error(String(data.error))
  return data as GeneratedDocuments
}

export async function createCheckoutSession(
  plan: 'premium_weekly' | 'premium_monthly',
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('create-checkout-session', {
    body: { plan },
  })

  if (error) throw error
  if (!data?.url) throw new Error('Could not start checkout')
  return data.url as string
}

export async function createPortalSession(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('create-portal-session', {
    body: {},
  })

  if (error) throw error
  if (data?.error) throw new Error(String(data.error))
  if (!data?.url) throw new Error('Could not open billing portal')
  return data.url as string
}

export async function deleteCheck(checkId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-check', {
    body: { checkId },
  })

  if (error) throw error
  if (data?.error) throw new Error(String(data.error))
}
