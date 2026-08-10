import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { Buffer } from 'node:buffer'
import mammoth from 'npm:mammoth@1.8.0'
import { extractText as extractPdfText, getDocumentProxy } from 'npm:unpdf@0.12.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_CV_CHARS = 15000
const MAX_ATTEMPTS = 3
const RATE_LIMIT_PER_HOUR = 5
const OPENAI_TIMEOUT_MS = 45000
// Actual enforcement of both limits lives in the reserve_check_analysis
// Postgres function (see migration add_reserve_check_analysis_rpc), which
// atomically checks and reserves a slot under a row lock — these constants
// exist here only to build the matching user-facing error messages; keep
// them in sync with the limits hardcoded in that function.
const PAID_TIER_DAILY_LIMIT = 8
const FREE_TIER_LIFETIME_LIMIT = 1

interface AnalyzeRequest {
  checkId: string
}

interface RawAnalysis {
  language: string
  experience_score: number
  skills_score: number
  uvp_score: number
  strength_1_finding: string
  strength_1_evidence: string
  strength_2_finding: string
  strength_2_evidence: string
  improvement_1_finding: string
  improvement_1_evidence: string
  improvement_2_finding: string
  improvement_2_evidence: string
  improvement_3_finding: string
  improvement_3_evidence: string
  prospect_1: string
  prospect_2: string
}

interface AnalysisResult {
  interview_probability_score: number
  strengths: string[]
  improvements: string[]
  prospects: string[]
  detected_language: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')

    if (!openaiApiKey) {
      return jsonResponse({ error: 'Analysis service is not configured' }, 503)
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const { checkId } = (await req.json()) as AnalyzeRequest
    if (!checkId) {
      return jsonResponse({ error: 'checkId is required' }, 400)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: recentAttempts, error: rateLimitError } = await adminClient
      .from('analyze_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', oneHourAgo)

    if (rateLimitError) {
      return jsonResponse({ error: 'Could not verify rate limit' }, 500)
    }

    if ((recentAttempts ?? 0) >= RATE_LIMIT_PER_HOUR) {
      return jsonResponse(
        { error: 'You have reached the limit of 5 checks per hour. Please try again later.' },
        429,
      )
    }

    const { data: check, error: checkError } = await adminClient
      .from('checks')
      .select('*')
      .eq('id', checkId)
      .eq('user_id', user.id)
      .single()

    if (checkError || !check) {
      return jsonResponse({ error: 'Check not found' }, 404)
    }

    if (check.job_description.trim().length < 50) {
      return jsonResponse({ error: 'Job description is too short to analyze' }, 400)
    }

    // Atomically checks the free/paid usage allowance and flips this check to
    // 'processing' in one transaction (row-locked on the user's profile), so
    // two concurrent requests (two tabs, a double submit) can't both read
    // "under limit" before either has committed. See the migration for full
    // reasoning; this must stay a single RPC call, not separate count+update
    // steps, or the atomicity guarantee is lost.
    const { data: reservation, error: reservationError } = await adminClient.rpc(
      'reserve_check_analysis',
      { p_check_id: checkId, p_user_id: user.id },
    )

    if (reservationError) {
      console.error('analyze-check: reserve_check_analysis failed', reservationError)
      return jsonResponse({ error: 'Could not verify usage limit' }, 500)
    }

    const reason = reservation?.[0]?.reason as string | undefined
    if (!reservation?.[0]?.allowed) {
      console.error('analyze-check: usage limit denied', { userId: user.id, checkId, reason })
      if (reason === 'free_tier_limit') {
        return jsonResponse(
          { error: `You have used your ${FREE_TIER_LIFETIME_LIMIT} free Recruiter Check. Upgrade to continue.` },
          429,
        )
      }
      if (reason === 'daily_limit') {
        return jsonResponse(
          { error: `You have reached today's limit of ${PAID_TIER_DAILY_LIMIT} checks. Please try again tomorrow.` },
          429,
        )
      }
      if (reason === 'already_processing' || reason === 'already_completed') {
        return jsonResponse({ error: 'This check is already being processed' }, 409)
      }
      return jsonResponse({ error: 'Could not start this check' }, 400)
    }

    await adminClient.from('analyze_requests').insert({ user_id: user.id })

    const { data: cvFile, error: downloadError } = await adminClient.storage
      .from('cvs')
      .download(check.cv_storage_path)

    if (downloadError || !cvFile) {
      console.error('analyze-check: CV download failed', { checkId, message: downloadError?.message })
      await markFailed(adminClient, checkId, 'Could not read CV file')
      return jsonResponse({ error: 'Could not read CV file' }, 400)
    }

    let cvText: string
    try {
      cvText = await extractText(cvFile, check.cv_file_name)
    } catch (error) {
      console.error('analyze-check: CV parsing failed', {
        checkId,
        fileName: check.cv_file_name,
        message: error instanceof Error ? error.message : String(error),
      })
      await markFailed(adminClient, checkId, 'Could not read text from this CV file')
      return jsonResponse({ error: 'Could not read text from this CV file' }, 400)
    }

    let analysis: AnalysisResult
    try {
      analysis = await generateFeedback(openaiApiKey, cvText, check.job_description, {
        jobTitle: check.job_title,
        companyName: check.company_name,
      })
    } catch (error) {
      console.error('analyze-check: analysis failed after retry', error)
      await markFailed(adminClient, checkId, 'Could not generate feedback. Please retry.')
      return jsonResponse({ error: 'Could not generate feedback' }, 502)
    }

    const { error: feedbackError } = await adminClient.from('feedback').upsert(
      {
        check_id: checkId,
        strengths: analysis.strengths,
        improvements: analysis.improvements,
        prospects: analysis.prospects,
      },
      { onConflict: 'check_id' },
    )

    if (feedbackError) {
      await markFailed(adminClient, checkId, 'Could not save feedback')
      return jsonResponse({ error: 'Could not save feedback' }, 500)
    }

    await adminClient
      .from('checks')
      .update({
        status: 'completed',
        interview_probability_score: analysis.interview_probability_score,
        error_message: null,
        // Stored so generate-documents reuses this exact value instead of
        // re-detecting from a separate model call, which could otherwise
        // drift onto a different language for the same check.
        detected_language: analysis.detected_language,
      })
      .eq('id', checkId)

    return jsonResponse({ success: true, checkId })
  } catch (error) {
    console.error('analyze-check error:', error)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})

async function markFailed(
  client: ReturnType<typeof createClient>,
  checkId: string,
  message: string,
) {
  await client
    .from('checks')
    .update({ status: 'failed', error_message: message })
    .eq('id', checkId)
}

async function extractText(file: Blob, fileName: string): Promise<string> {
  const lowerName = fileName.toLowerCase()
  const arrayBuffer = await file.arrayBuffer()

  let text: string

  if (lowerName.endsWith('.pdf')) {
    const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer))
    const result = await extractPdfText(pdf, { mergePages: true })
    text = Array.isArray(result.text) ? result.text.join('\n') : result.text
  } else if (lowerName.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) })
    text = result.value
  } else if (lowerName.endsWith('.txt')) {
    // Pasted-CV path: the client saves pasted text as a plain-text file.
    text = new TextDecoder('utf-8').decode(arrayBuffer)
  } else {
    throw new Error('Unsupported file type')
  }

  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length < 50) {
    throw new Error('Extracted text is too short')
  }

  return cleaned.slice(0, MAX_CV_CHARS)
}

/**
 * Structured JSON output, schema-validated, retry once on failure per the
 * locked spec. Never returns (or lets the caller persist) malformed results —
 * both attempts must pass validateAnalysis or this throws.
 */
async function generateFeedback(
  apiKey: string,
  cvText: string,
  jobDescription: string,
  context: { jobTitle: string | null; companyName: string | null },
): Promise<AnalysisResult> {
  const attemptErrors: string[] = []

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const raw = await callOpenAI(apiKey, cvText, jobDescription, context)
      return normalizeAnalysis(raw)
    } catch (error) {
      attemptErrors.push(error instanceof Error ? error.message : String(error))
    }
  }

  throw new Error(`All attempts failed: ${JSON.stringify(attemptErrors)}`)
}

async function callOpenAI(
  apiKey: string,
  cvText: string,
  jobDescription: string,
  context: { jobTitle: string | null; companyName: string | null },
): Promise<RawAnalysis> {
  // Locked product rule: the job description is the sole authority on output
  // language. No user override exists anywhere in this app — the CV's own
  // language must never win, and this is never surfaced as a setting.
  const languageInstruction =
    'First, determine the language field: identify the PRIMARY language of the actual prose in the job description — ignore isolated foreign-language elements such as company names, software/tool/product names, technical terms, certification names, or short boilerplate sections in another language (e.g. a Dutch job description that mentions "Salesforce", "Project Management", or "Microsoft PowerPoint" is still a Dutch job description). Only if the job description is genuinely too short or ambiguous to determine a primary language should you fall back to the language of the original CV; only if neither yields a clear answer, default to English. Output the language field as a lowercase ISO 639-1 two-letter code (e.g. "en", "nl", "de", "fr", "es", "it", "pt", "pl"), covering any language, not just a fixed small list. Write every strength, improvement, and prospect entirely in that language, using natural, professional wording a native speaker recruiter would actually write, not a literal translation of the English guidance below. Never translate candidate names, company names, brand names, product names, tool names, or established technical/certification terminology where translating them would be misleading (e.g. "Microsoft PowerPoint", "Salesforce", "AWS" stay as is regardless of output language).'

  const systemPrompt = `You are an experienced, technically rigorous recruiter screening a candidate's application. Evaluate the CV against the job description using this internal rubric, without naming or restating it in your output:

- Experience (weight 40%): how well the candidate's work history matches the role's seniority, scope, and domain.
- Skills (weight 35%): how well the candidate's stated skills and tools match the role's requirements.
- Unique Value Proposition (weight 25%): apply an Evidence → Strength → Employer Value framework — find concrete evidence in the CV, translate it into a genuine strength, and explain the value it offers this specific employer.

Score each dimension 0-100. Score conservatively and critically, the way a skeptical recruiter who reviews hundreds of CVs would — most candidates, even strong ones, should land in the 40-75 range per dimension. Reserve 80+ only for a genuinely exceptional, near-perfect match on that dimension with no notable gaps; scores above 80 must be rare, never a default. Do not inflate scores to be encouraging — flag real gaps honestly.

${languageInstruction}

Then write feedback that helps the candidate see their own application the way a recruiter would — direct, specific, evidence-based, technical, and never generic. Each strength and area to improve is split into two separate fields: a "_finding" field and an "_evidence" field. Both are required and both must be non empty — never leave an "_evidence" field as a restatement of its "_finding" field or as a near-duplicate; it must add genuinely new information. The "_finding" field is a 2 to 5 word bolded lead-in naming the pattern or action, e.g. "Strong sales performance" or "Quantify your impact" (no trailing period needed, it will be rendered as a heading). The matching "_evidence" field is one full sentence giving the detail behind it, e.g. "Your record of exceeding sales targets directly supports the role's revenue expectations."
- strength_1_finding / strength_1_evidence and strength_2_finding / strength_2_evidence: the finding names the underlying pattern that makes the CV effective, the way a recruiter commenting on craft would. Never restate or quote a specific achievement bullet from the CV in the finding — the candidate already knows what they wrote, so quoting it back adds nothing. The evidence states why that pattern specifically matters to this employer for this role (the Employer Value step of the Evidence, Strength, Employer Value framework). If there's genuinely no quantification anywhere, base strengths on other real craft signals present (e.g. clear ownership/scope language, relevant tools named, well-structured bullets) — never invent a pattern that isn't there.
- improvement_1_finding / improvement_1_evidence, improvement_2_finding / improvement_2_evidence, and improvement_3_finding / improvement_3_evidence: the finding is a direct, imperative action, e.g. "Quantify your impact" or "Strengthen leadership evidence." Never hedge with phrasing like "Consider adding", "You may want to", or "It would be helpful to". The evidence states the specific improvement to make, e.g. "Add conversion rates, revenue generated, pipeline value, or targets exceeded." At least one of the three must address quantification — if the CV lacks metrics to support its claims, say so and name the specific stats to add; if the CV already uses strong statistics throughout, skip this and use a different, still-technical area to improve instead. At least one must push the candidate to elaborate in more depth on whichever single experience entry is most relevant to this specific job — the one a hiring manager would scrutinize most — rather than staying surface-level.
- prospect_1 and prospect_2: plain, concise sentences. One sentence on why the candidate can still be competitive for this role or closely related roles, and one sentence on which single improvement would most increase interview likelihood. Keep both realistic and evidence-based, not generic encouragement.

Never use hyphens, en dashes, or em dashes anywhere in your output text (no "-", "–", or "—", including inside compound words). Write in plain sentences instead, using commas, periods, or separate words (e.g. "well structured" not "well-structured", "data driven" not "data-driven"). In Dutch, prefer natural solid compounds where that is correct Dutch spelling (e.g. "klantgericht" not "klant gericht") rather than forcing a space that would be spelled wrong.`

  const userPrompt = `Job title: ${context.jobTitle ?? 'Not specified'}
Company: ${context.companyName ?? 'Not specified'}

Job description:
${jobDescription}

CV:
${cvText}`

  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'recruiter_check_feedback',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              language: {
                type: 'string',
                description: 'Lowercase ISO 639-1 two-letter language code of the job description, e.g. en, nl, de, fr, es.',
              },
              experience_score: { type: 'integer' },
              skills_score: { type: 'integer' },
              uvp_score: { type: 'integer' },
              strength_1_finding: { type: 'string' },
              strength_1_evidence: { type: 'string' },
              strength_2_finding: { type: 'string' },
              strength_2_evidence: { type: 'string' },
              improvement_1_finding: { type: 'string' },
              improvement_1_evidence: { type: 'string' },
              improvement_2_finding: { type: 'string' },
              improvement_2_evidence: { type: 'string' },
              improvement_3_finding: { type: 'string' },
              improvement_3_evidence: { type: 'string' },
              prospect_1: { type: 'string' },
              prospect_2: { type: 'string' },
            },
            required: [
              'language',
              'experience_score',
              'skills_score',
              'uvp_score',
              'strength_1_finding',
              'strength_1_evidence',
              'strength_2_finding',
              'strength_2_evidence',
              'improvement_1_finding',
              'improvement_1_evidence',
              'improvement_2_finding',
              'improvement_2_evidence',
              'improvement_3_finding',
              'improvement_3_evidence',
              'prospect_1',
              'prospect_2',
            ],
            additionalProperties: false,
          },
        },
      },
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenAI API error: ${response.status} ${body}`)
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const rawText = payload.choices?.[0]?.message?.content

  if (!rawText) {
    throw new Error('Empty response from analysis service')
  }

  return JSON.parse(rawText) as RawAnalysis
}

// Detection should never block a result — if the model returns something
// that isn't a plausible ISO 639-1 code, fall back to English rather than
// fail the whole analysis over a formatting slip in one internal field.
const LANGUAGE_CODE_RE = /^[a-z]{2}$/

function normalizeAnalysis(raw: RawAnalysis): AnalysisResult {
  const detectedLanguage = LANGUAGE_CODE_RE.test(raw.language ?? '') ? raw.language : 'en'

  const strengths = [
    combineFinding(raw.strength_1_finding, raw.strength_1_evidence),
    combineFinding(raw.strength_2_finding, raw.strength_2_evidence),
  ].filter((item): item is string => item !== null)
  const improvements = [
    combineFinding(raw.improvement_1_finding, raw.improvement_1_evidence),
    combineFinding(raw.improvement_2_finding, raw.improvement_2_evidence),
    combineFinding(raw.improvement_3_finding, raw.improvement_3_evidence),
  ].filter((item): item is string => item !== null)
  const prospects = sanitizeStrings([raw.prospect_1, raw.prospect_2])

  if (strengths.length !== 2) throw new Error('Expected exactly 2 strengths')
  if (improvements.length !== 3) throw new Error('Expected exactly 3 areas to improve')
  if (prospects.length !== 2) throw new Error('Expected exactly 2 prospects')

  if (
    !isFiniteNumber(raw.experience_score) ||
    !isFiniteNumber(raw.skills_score) ||
    !isFiniteNumber(raw.uvp_score)
  ) {
    throw new Error('Missing or invalid scores')
  }

  const weighted =
    0.4 * clampScore(raw.experience_score) +
    0.35 * clampScore(raw.skills_score) +
    0.25 * clampScore(raw.uvp_score)

  return {
    interview_probability_score: Math.round(weighted),
    strengths,
    improvements,
    prospects,
    detected_language: detectedLanguage,
  }
}

function sanitizeStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => stripDashes(item.trim()))
    .filter((item) => item.length > 0)
}

/**
 * Strengths and areas to improve arrive as separate finding/evidence schema
 * fields (so the model can't skip the evidence half — see the JSON schema's
 * required list) and get joined back into a single "Finding. Evidence."
 * string here, which is what the Feedback page's splitFinding() expects in
 * order to bold the finding and render the rest as plain text.
 */
function combineFinding(finding: unknown, evidence: unknown): string | null {
  if (typeof finding !== 'string' || typeof evidence !== 'string') return null

  const cleanFinding = stripDashes(finding.trim()).replace(/[.!?]+$/, '')
  const cleanEvidence = stripDashes(evidence.trim())
  if (!cleanFinding || !cleanEvidence) return null

  return `${cleanFinding}. ${cleanEvidence}`
}

/**
 * The "never use hyphens" prompt rule isn't reliable on its own (gpt-4o-mini
 * still slips into compounds like "data-analyse" in Dutch), so this mirrors
 * the deterministic sanitizer used in generate-documents rather than relying
 * on prompt wording alone.
 */
function stripDashes(text: string): string {
  return text
    .replace(/(\w)[-–—](?=\w)/g, '$1 ')
    .replace(/\s*[-–—]\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/ ,/g, ',')
    .trim()
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * A hung OpenAI request would otherwise be caught only by the platform's own
 * hard timeout, at an unpredictable point that may not leave time for
 * markFailed to run. Aborting deterministically at OPENAI_TIMEOUT_MS lets
 * this fail into the normal retry/markFailed path instead.
 */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS)

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`OpenAI request timed out after ${OPENAI_TIMEOUT_MS}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
