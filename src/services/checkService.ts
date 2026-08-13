import { supabase } from '@/lib/supabase'
import type {
  Check,
  CheckWithFeedback,
  Feedback,
  Profile,
  ProductFeedback,
  Subscription,
} from '@/types'

/**
 * Storage path extensions are derived from the browser-reported MIME type,
 * not the user-supplied filename — a filename like "cv.pdf.exe" would
 * otherwise land its literal ".exe" extension in the storage path. The
 * bucket's own MIME allowlist (pdf/docx/text, enforced server-side) already
 * rejects anything else at upload time, so this only needs to cover those.
 */
function extensionForMimeType(mimeType: string): string {
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return 'docx'
  }
  if (mimeType === 'text/plain') return 'txt'
  return 'pdf'
}

/**
 * supabase-js throws a generic FunctionsHttpError ("Edge Function returned a
 * non-2xx status code") for any non-2xx response — the actual JSON error
 * body our functions return (e.g. "You have used your 1 free Recruiter
 * Check...") is only reachable via `error.context`, a Response object that
 * nothing here was reading, so every specific server-side message was being
 * silently replaced by that generic string. This recovers it.
 */
async function resolveFunctionError(error: unknown): Promise<Error> {
  const context = (error as { context?: unknown } | null)?.context
  if (context instanceof Response) {
    try {
      const body = (await context.clone().json()) as { error?: unknown }
      if (body?.error) return new Error(String(body.error))
    } catch {
      // Body wasn't JSON (or already consumed) — fall through.
    }
  }
  return error instanceof Error ? error : new Error('Something went wrong')
}

export interface DraftCheckUpdate {
  jobTitle?: string
  companyName?: string
  jobDescription?: string
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
  checkId: string,
  firstName: string | null,
  targetRole: string | null,
  rating: number,
  comment: string,
  featureConsent: boolean,
): Promise<ProductFeedback> {
  const { data, error } = await supabase
    .from('product_feedback')
    .insert({
      user_id: userId,
      email,
      check_id: checkId,
      display_name: firstName,
      target_role: targetRole,
      rating,
      comment: comment.trim() || null,
      feature_consent: featureConsent,
      feature_consent_at: featureConsent ? new Date().toISOString() : null,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as ProductFeedback
}

export async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account', { body: {} })

  if (error) throw await resolveFunctionError(error)
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

export const FREE_TIER_LIFETIME_LIMIT = 1
export const PAID_TIER_DAILY_LIMIT = 8

export type CheckGateReason = 'free-tier' | 'daily-limit' | null

/**
 * Free tier: 1 completed check ever, per the locked spec. Premium tiers
 * (weekly/monthly) are capped at 8 checks per UTC day — not a monetization
 * lever, just reinforcing the "quality over quantity" positioning even for
 * paying users. This reads the durable counters on the profile row
 * (lifetime_checks_consumed / daily_checks_consumed / daily_checks_reset_at,
 * see migration durable_usage_counters) rather than counting `checks` rows —
 * counting rows would let a deleted completed check silently restore the
 * allowance, which is exactly what the durable counters exist to prevent.
 * This is a client-side pre-check only, for UI gating before the user even
 * starts a draft; the authoritative, atomic enforcement lives server-side in
 * the reserve_check_analysis Postgres function, which this mirrors.
 */
export function getCheckGateReason(profile: Profile): CheckGateReason {
  if (profile.subscription_tier === 'free') {
    return profile.lifetime_checks_consumed >= FREE_TIER_LIFETIME_LIMIT ? 'free-tier' : null
  }

  const consumedToday = isDailyCounterCurrent(profile) ? profile.daily_checks_consumed : 0
  return consumedToday < PAID_TIER_DAILY_LIMIT ? null : 'daily-limit'
}

/**
 * daily_checks_reset_at is a plain `date` column (UTC), so it comes back as
 * "YYYY-MM-DD" — compared directly against today's UTC date string rather
 * than parsing into a Date, avoiding any local-timezone drift.
 */
function isDailyCounterCurrent(profile: Profile): boolean {
  if (!profile.daily_checks_reset_at) return false
  const todayUtc = new Date().toISOString().slice(0, 10)
  return profile.daily_checks_reset_at === todayUtc
}

/**
 * Reads today's usage straight off the profile's durable counter (no query)
 * for showing "X of 8 today" in the account UI, so paid-tier users can see
 * the daily cap before they hit it instead of discovering it only when
 * blocked. A stale reset date (counter last touched on an earlier UTC day)
 * reads as 0 rather than a leftover count from a previous day.
 */
export function getTodaysCheckCount(profile: Profile): number {
  return isDailyCounterCurrent(profile) ? profile.daily_checks_consumed : 0
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
  const fileExt = extensionForMimeType(cvFile.type)
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
  } = {}
  if (updates.jobTitle !== undefined) payload.job_title = updates.jobTitle.trim() || null
  if (updates.companyName !== undefined) payload.company_name = updates.companyName.trim() || null
  if (updates.jobDescription !== undefined) payload.job_description = updates.jobDescription

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
  const fileExt = extensionForMimeType(cvFile.type)
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

  if (error) throw await resolveFunctionError(error)
  if (data?.error) throw new Error(String(data.error))
}

/**
 * Attempts a server-side fetch + extraction of the job description from a
 * public job posting URL. The edge function returns the exact user-facing
 * fallback message on any failure (blocked/private URL, non-HTML response,
 * extraction too short, etc.), so callers can show it directly.
 */
export async function extractJobDescriptionFromUrl(url: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('extract-job-url', {
    body: { url },
  })

  if (error) throw await resolveFunctionError(error)
  if (data?.error) throw new Error(String(data.error))
  return String(data.jobDescription)
}

/**
 * Uploads a PDF/DOCX/TXT job-description file for server-side text
 * extraction. Nothing is persisted to storage — the file is parsed and
 * discarded within the request.
 */
export async function extractJobDescriptionFromFile(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)

  const { data, error } = await supabase.functions.invoke('extract-job-file', {
    body: form,
  })

  if (error) throw await resolveFunctionError(error)
  if (data?.error) throw new Error(String(data.error))
  return String(data.jobDescription)
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

  if (error) throw await resolveFunctionError(error)
  if (data?.error) throw new Error(String(data.error))
  return data as GeneratedDocuments
}

export async function createCheckoutSession(
  plan: 'premium_weekly' | 'premium_monthly',
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('create-checkout-session', {
    body: { plan },
  })

  if (error) throw await resolveFunctionError(error)
  if (!data?.url) throw new Error('Could not start checkout')
  return data.url as string
}

export async function createPortalSession(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('create-portal-session', {
    body: {},
  })

  if (error) throw await resolveFunctionError(error)
  if (data?.error) throw new Error(String(data.error))
  if (!data?.url) throw new Error('Could not open billing portal')
  return data.url as string
}

export async function deleteCheck(checkId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-check', {
    body: { checkId },
  })

  if (error) throw await resolveFunctionError(error)
  if (data?.error) throw new Error(String(data.error))
}

/**
 * Mints a short-lived, single-use code the signed-in web session can hand
 * off to the browser extension so it can establish its own independent
 * session — no password, no shared storage, no service-role key ever
 * reaches the extension.
 */
export async function createExtensionConnectCode(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('create-extension-connect-code', {
    body: {},
  })

  if (error) throw await resolveFunctionError(error)
  if (data?.error) throw new Error(String(data.error))
  return String(data.code)
}

export interface JobCapture {
  jobTitle: string | null
  companyName: string | null
  jobDescription: string
  jobUrl: string | null
}

/**
 * Fetches a job captured by the browser extension. Single-use: the server
 * deletes the capture as it's read, so this can only ever populate one New
 * Check.
 */
export async function fetchJobCapture(captureId: string): Promise<JobCapture> {
  const { data, error } = await supabase.functions.invoke('get-job-capture', {
    body: { captureId },
  })

  if (error) throw await resolveFunctionError(error)
  if (data?.error) throw new Error(String(data.error))
  return {
    jobTitle: data.jobTitle ?? null,
    companyName: data.companyName ?? null,
    jobDescription: String(data.jobDescription),
    jobUrl: data.jobUrl ?? null,
  }
}
