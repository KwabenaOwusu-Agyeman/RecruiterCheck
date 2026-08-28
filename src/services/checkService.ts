import { supabase } from '@/lib/supabase'
import type { Check, CheckLedgerEntry, CheckWithFeedback, Feedback, KeywordScanResult, PackId, Profile } from '@/types'

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

export async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account', { body: {} })

  if (error) throw await resolveFunctionError(error)
  if (data?.error) throw new Error(String(data.error))
}

/**
 * Full check history is an Active/Power pack perk (RLS itself only returns
 * every row for a user who has ever purchased one of those packs — see
 * migration gate_check_history_by_pack — otherwise just the single most
 * recent check comes back). This is not a client-side filter, the extra
 * rows never leave the server for a Starter-only user in the first place.
 */
export async function getChecks(userId: string): Promise<Check[]> {
  const { data, error } = await supabase
    .from('checks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => mapCheck(row as Check))
}

/**
 * Total check count regardless of history-access tier, via a
 * security-definer RPC rather than counting the rows getChecks() returns —
 * those are already RLS-restricted to the visible subset, so counting them
 * could never reveal how many are locked.
 */
export async function getCheckCount(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_check_count', { p_user_id: userId })
  if (error) throw error
  return data ?? 0
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

export type CheckGateReason = 'free-tier' | 'no-balance' | null

/**
 * Free lifetime check first, then checks_balance funds everything after
 * (see migration 20260825120000_check_pack_system.sql) — this reads the
 * durable counters on the profile row rather than counting `checks` rows,
 * since counting rows would let a deleted completed check silently restore
 * the allowance. This is a client-side pre-check only, for UI gating before
 * the user even starts a draft; the authoritative, atomic enforcement lives
 * server-side in the reserve_check_analysis Postgres function, which this
 * mirrors.
 */
export function getCheckGateReason(profile: Profile): CheckGateReason {
  if (profile.lifetime_checks_consumed < FREE_TIER_LIFETIME_LIMIT) {
    return null
  }

  return profile.checks_balance > 0 ? null : 'no-balance'
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
  // Undefined for a "Likely Interview Candidate" score (85+) — the Improved
  // CV Draft is withheld at that score group regardless of pack; see
  // generate-documents/index.ts.
  cv?: string
  // Undefined below Large, where only the improved CV draft is entitled.
  coverLetter?: string
  emailForRecruiter?: string
  // Undefined whenever only one document was generated (nothing to bundle).
  zip?: string
}

export async function generateDocuments(checkId: string): Promise<GeneratedDocuments> {
  const { data, error } = await supabase.functions.invoke('generate-documents', {
    body: { checkId },
  })

  if (error) throw await resolveFunctionError(error)
  if (data?.error) throw new Error(String(data.error))
  return data as GeneratedDocuments
}

/**
 * Every pack purchase is an independent one-time Stripe Checkout session —
 * packs are additive, never a plan swap, so there's no "update in place"
 * path any more (see create-checkout-session).
 */
export async function createCheckoutSession(packId: PackId): Promise<string> {
  const { data, error } = await supabase.functions.invoke('create-checkout-session', {
    body: { packId },
  })

  if (error) throw await resolveFunctionError(error)
  if (!data?.url) throw new Error('Could not start checkout')
  return data.url as string
}

/**
 * The full purchase/use/refund/expiry audit trail for the signed-in user,
 * most recent first — RLS restricts this to the caller's own rows (see
 * migration 20260825120000_check_pack_system.sql).
 */
export async function getLedgerHistory(userId: string): Promise<CheckLedgerEntry[]> {
  const { data, error } = await supabase
    .from('check_ledger')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as CheckLedgerEntry[]
}

/**
 * The soonest expiry among the user's batches that still have an unused
 * balance, for the "N checks left, some expire on <date>" display — null if
 * the user has no purchased balance (nothing to expire) or every remaining
 * batch happens to be a never-expiring manual adjustment.
 */
export async function getNearestBatchExpiry(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('credit_batches')
    .select('expires_at')
    .eq('user_id', userId)
    .gt('checks_remaining', 0)
    .not('expires_at', 'is', null)
    .order('expires_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data?.expires_at ?? null
}

/**
 * The free keyword-scan feature — entirely separate from analyzeCheck, no
 * shared code path, no persistence. The CV file is sent directly as base64
 * rather than uploaded to Storage first, since nothing about this feature is
 * ever saved.
 */
export async function runKeywordScan(cvFile: File, jobDescription: string): Promise<KeywordScanResult> {
  const cvBase64 = await fileToBase64(cvFile)

  const { data, error } = await supabase.functions.invoke('keyword-scan', {
    body: {
      cvBase64,
      cvFileName: cvFile.name,
      cvMimeType: cvFile.type,
      jobDescription,
    },
  })

  if (error) throw await resolveFunctionError(error)
  if (data?.error) throw new Error(String(data.error))
  return data as KeywordScanResult
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}


export async function submitCheckSentiment(
  checkId: string,
  sentiment: 'positive' | 'negative',
  note?: string,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { error } = await supabase
    .from('check_sentiment')
    .upsert(
      { check_id: checkId, user_id: user.id, sentiment, note: note?.trim() || null },
      { onConflict: 'check_id' },
    )

  if (error) throw new Error(error.message)
}

/**
 * Explicit-consent public testimonial capture, feeding public.product_feedback
 * (one row per user, upserted on user_id per the table's own unique index).
 * feature_consent is always true here since this call only happens when the
 * user has actively opted in, comment and displayName are required by the
 * table's own check constraint whenever feature_consent is true. Shown on
 * public_testimonials (see testimonialsService.ts) only after this.
 */
export async function submitFeatureTestimonial(params: {
  checkId: string
  rating: number
  comment: string
  displayName: string
  targetRole?: string | null
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) throw new Error('Not signed in')

  const { error } = await supabase
    .from('product_feedback')
    .upsert(
      {
        user_id: user.id,
        email: user.email,
        check_id: params.checkId,
        rating: params.rating,
        comment: params.comment.trim(),
        display_name: params.displayName.trim(),
        target_role: params.targetRole?.trim() || null,
        feature_consent: true,
        feature_consent_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )

  if (error) throw new Error(error.message)
}

/**
 * Whether the current user already has a product_feedback row — the table
 * allows exactly one per user (see product_feedback_one_per_user_idx), so a
 * second submitFeatureTestimonial call would silently overwrite their first
 * public testimonial rather than adding a new one. Used to stop asking once
 * they've already given one, instead of re-prompting on every later check.
 */
export async function hasSubmittedTestimonial(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data, error } = await supabase
    .from('product_feedback')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data !== null
}

export async function requestRefund(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('request-refund', {
    body: {},
  })

  if (error) throw await resolveFunctionError(error)
  if (data?.error) throw new Error(String(data.error))
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
