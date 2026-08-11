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
  job_title: string
  company_name: string
  experience_score: number
  skills_score: number
  uvp_score: number
  strength_1_finding: string
  strength_1_evidence: string
  strength_2_finding: string
  strength_2_evidence: string
  improvement_1_finding: string
  improvement_1_evidence: string
  improvement_1_example: string
  improvement_2_finding: string
  improvement_2_evidence: string
  improvement_2_example: string
  improvement_3_finding: string
  improvement_3_evidence: string
  improvement_3_example: string
  prospect_1: string
  prospect_2: string
  new_claims_introduced: string[]
}

interface AnalysisResult {
  interview_probability_score: number
  experience_score: number
  skills_score: number
  uvp_score: number
  strengths: string[]
  improvements: string[]
  prospects: string[]
  detected_language: string
  job_title: string | null
  company_name: string | null
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

    // Marks the check completed and records usage in one atomic, idempotent
    // step (see migration durable_usage_counters) — usage is a durable
    // counter on profiles, never derived from counting `checks` rows, so
    // deleting a completed check afterward can never restore this slot.
    const { error: completeError } = await adminClient.rpc('complete_check_analysis', {
      p_check_id: checkId,
      p_user_id: user.id,
      p_score: analysis.interview_probability_score,
      p_detected_language: analysis.detected_language,
      p_job_title: analysis.job_title,
      p_company_name: analysis.company_name,
      p_experience_score: analysis.experience_score,
      p_skills_score: analysis.skills_score,
      p_uvp_score: analysis.uvp_score,
    })

    if (completeError) {
      console.error('analyze-check: complete_check_analysis failed', {
        checkId,
        message: completeError.message,
      })
      return jsonResponse({ error: 'Could not save analysis result' }, 500)
    }

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
  const arrayBuffer = await file.arrayBuffer()

  // Dispatch on the downloaded blob's own Content-Type (set by Supabase
  // Storage from the mimetype it recorded at upload, which the "cvs" bucket
  // already restricts via allowed_mime_types) rather than the client-supplied
  // file name — a direct API call could otherwise set cv_file_name to
  // anything to steer this to the wrong parser. Only fall back to the file
  // name suffix if the blob genuinely has no type (older rows uploaded
  // before content type was always set).
  const mimeType = file.type
  const lowerName = fileName.toLowerCase()
  const isPdf = mimeType === 'application/pdf' || (!mimeType && lowerName.endsWith('.pdf'))
  const isDocx =
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    (!mimeType && lowerName.endsWith('.docx'))
  const isTxt = mimeType === 'text/plain' || (!mimeType && lowerName.endsWith('.txt'))

  let text: string

  if (isPdf) {
    const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer))
    const result = await extractPdfText(pdf, { mergePages: true })
    text = Array.isArray(result.text) ? result.text.join('\n') : result.text
  } else if (isDocx) {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) })
    text = result.value
  } else if (isTxt) {
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
    'First, determine the language field: identify the PRIMARY language of the actual prose in the job description, based only on the literal words and grammar used in the text — ignore isolated foreign-language elements such as company names, software/tool/product names, technical terms, certification names, or short boilerplate sections in another language (e.g. a Dutch job description that mentions "Salesforce", "Project Management", or "Microsoft PowerPoint" is still a Dutch job description). Critically, never infer the language from geography: a job description written entirely in English is still English even if it mentions a company, office, city, or country where a different language is spoken (e.g. "based in our Amsterdam office" or "Berlin, Germany" inside an English sentence does not make the job description Dutch or German) — judge only the actual language the sentences are written in, never the location they describe. Only if the job description is genuinely too short or ambiguous to determine a primary language should you fall back to the language of the original CV; only if neither yields a clear answer, default to English. Output the language field as a lowercase ISO 639-1 two-letter code (e.g. "en", "nl", "de", "fr", "es", "it", "pt", "pl"), covering any language, not just a fixed small list. Write every strength, improvement, and prospect entirely in that language, using natural, professional wording a native speaker recruiter would actually write, not a literal translation of the English guidance below. Never translate candidate names, company names, brand names, product names, tool names, or established technical/certification terminology where translating them would be misleading (e.g. "Microsoft PowerPoint", "Salesforce", "AWS" stay as is regardless of output language).'

  const systemPrompt = `You are an experienced, technically rigorous recruiter screening a candidate's application. Evaluate the CV against the job description using this internal rubric, without naming or restating it in your output:

- Experience (weight 40%): how well the candidate's work history matches the role's seniority, scope, and domain.
- Skills (weight 35%): how well the candidate's stated skills and tools match the role's requirements.
- Unique Value Proposition (weight 25%): apply an Evidence → Strength → Employer Value framework — find concrete evidence in the CV, translate it into a genuine strength, and explain the value it offers this specific employer.

Score each dimension 0-100. Score conservatively and critically, the way a skeptical recruiter who reviews hundreds of CVs would — most candidates, even strong ones, should land in the 40-75 range per dimension. Reserve 80+ only for a genuinely exceptional, near-perfect match on that dimension with no notable gaps; scores above 80 must be rare, never a default. Do not inflate scores to be encouraging — flag real gaps honestly.

Also populate job_title and company_name: ${
    context.jobTitle || context.companyName
      ? `these are already known (job_title: ${context.jobTitle ?? 'unknown'}, company_name: ${context.companyName ?? 'unknown'}) — return them back exactly as given for whichever one is known; only extract the other one yourself if it says "unknown" above.`
      : 'extract both directly from the job description text.'
  } job_title is the specific role title as literally stated in the job description (e.g. "Senior Backend Engineer"), not a paraphrase. company_name is the hiring company's name as literally stated. If the job description genuinely does not state one of these clearly (e.g. a confidential/blind posting with no company named, or phrasing too generic to name a specific title), return an empty string for that field rather than guessing or inventing a plausible-sounding value — an empty string is always safer than a wrong guess here.

${languageInstruction}

Whatever language you determined above, EVERY field below (strength_1_finding, strength_1_evidence, strength_2_finding, strength_2_evidence, improvement_1_finding, improvement_1_evidence, improvement_2_finding, improvement_2_evidence, improvement_3_finding, improvement_3_evidence, prospect_1, prospect_2) must be written entirely in that same language, with zero English sentences slipped in, even if that language is less common. Do not default to English once you reach this part.

Then write feedback that helps the candidate see their own application the way a recruiter would — direct, specific, evidence-based, technical, and never generic. Each strength and area to improve is split into two separate fields: a "_finding" field and an "_evidence" field. Both are required and both must be non empty — never leave an "_evidence" field as a restatement of its "_finding" field or as a near-duplicate; it must add genuinely new information. The "_finding" field is a 2 to 5 word bolded lead-in naming the pattern or action, e.g. "Strong sales performance" or "Quantify your impact" (no trailing period needed, it will be rendered as a heading). The matching "_evidence" field is one full sentence giving the detail behind it, e.g. "Your record of exceeding sales targets directly supports the role's revenue expectations."
- strength_1_finding / strength_1_evidence and strength_2_finding / strength_2_evidence: the finding names the underlying pattern that makes the CV effective, the way a recruiter commenting on craft would. Never restate or quote a specific achievement bullet from the CV in the finding — the candidate already knows what they wrote, so quoting it back adds nothing. The evidence states why that pattern specifically matters to this employer for this role (the Employer Value step of the Evidence, Strength, Employer Value framework). If there's genuinely no quantification anywhere, base strengths on other real craft signals present (e.g. clear ownership/scope language, relevant tools named, well-structured bullets) — never invent a pattern that isn't there.
- improvement_1_finding / improvement_1_evidence / improvement_1_example, improvement_2_finding / improvement_2_evidence / improvement_2_example, and improvement_3_finding / improvement_3_evidence / improvement_3_example: the finding is a direct, imperative action, e.g. "Quantify your impact" or "Strengthen leadership evidence." Never hedge with phrasing like "Consider adding", "You may want to", or "It would be helpful to". The evidence states the specific improvement to make, e.g. "Add conversion rates, revenue generated, pipeline value, or targets exceeded." At least one of the three must address quantification — if the CV lacks metrics to support its claims, say so and name the kind of stats to add; if the CV already uses strong statistics throughout, skip this and use a different, still-technical area to improve instead. At least one must push the candidate to elaborate in more depth on whichever single experience entry is most relevant to this specific job — the one a hiring manager would scrutinize most — rather than staying surface-level. The example field is optional (use an empty string when a worked example would not add value) but should be filled in whenever it would concretely show the candidate what a better bullet looks like, especially for the quantification-focused item: a short example sentence in the style of a CV bullet demonstrating the change, e.g. "Designed and implemented a new workflow that increased profit by X%." You do not know the candidate's actual numbers, so any figure inside an example must always be a generic placeholder such as X%, €X, X customers, or X hours, never a specific invented number — this is an absolute rule, since a plausible sounding fabricated number is worse than no example at all.
- prospect_1 and prospect_2: plain, concise sentences. One sentence on why the candidate can still be competitive for this role or closely related roles, and one sentence on which single improvement would most increase interview likelihood. Keep both realistic and evidence-based, not generic encouragement.

Finally, self check your own output and populate new_claims_introduced: a JSON array of any specific fact (a metric, employer name, date, credential, or achievement) that you stated about the candidate anywhere in strengths, improvements, or prospects that is not actually present in the original CV text. Placeholder values like "X%" are never claims and must never appear in this list. If, after careful review, you introduced no such fact, return an empty array.

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
              job_title: {
                type: 'string',
                description: 'The role title as literally stated in the job description, or an empty string if not clearly stated.',
              },
              company_name: {
                type: 'string',
                description: "The hiring company's name as literally stated in the job description, or an empty string if not clearly stated.",
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
              improvement_1_example: { type: 'string' },
              improvement_2_finding: { type: 'string' },
              improvement_2_evidence: { type: 'string' },
              improvement_2_example: { type: 'string' },
              improvement_3_finding: { type: 'string' },
              improvement_3_evidence: { type: 'string' },
              improvement_3_example: { type: 'string' },
              prospect_1: { type: 'string' },
              prospect_2: { type: 'string' },
              new_claims_introduced: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Any specific fact about the candidate stated in strengths/improvements/prospects that is not present in the original CV. Empty array if none.',
              },
            },
            required: [
              'language',
              'job_title',
              'company_name',
              'experience_score',
              'skills_score',
              'uvp_score',
              'strength_1_finding',
              'strength_1_evidence',
              'strength_2_finding',
              'strength_2_evidence',
              'improvement_1_finding',
              'improvement_1_evidence',
              'improvement_1_example',
              'improvement_2_finding',
              'improvement_2_evidence',
              'improvement_2_example',
              'improvement_3_finding',
              'improvement_3_evidence',
              'improvement_3_example',
              'prospect_1',
              'prospect_2',
              'new_claims_introduced',
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

// Live testing found a real failure mode: the model can correctly set
// language: "de" while still writing the actual prose in English (it
// nails detection but doesn't follow through on generation for a
// less-common target language). Nothing structural catches that, so this
// checks for English leakage specifically — not a positive check for any
// particular target language (which wouldn't generalize), just "did this
// suspiciously read as English when it wasn't supposed to."
const ENGLISH_TELLS = [' the ', ' and ', ' your ', ' that ', ' with ', ' this ', ' for ', ' you ', ' are ', ' have ']

function looksLikeEnglish(text: string): boolean {
  const padded = ` ${text.toLowerCase()} `
  return ENGLISH_TELLS.filter((tell) => padded.includes(tell)).length >= 5
}

function normalizeAnalysis(raw: RawAnalysis): AnalysisResult {
  const detectedLanguage = LANGUAGE_CODE_RE.test(raw.language ?? '') ? raw.language : 'en'

  const strengths = [
    combineFinding(raw.strength_1_finding, raw.strength_1_evidence),
    combineFinding(raw.strength_2_finding, raw.strength_2_evidence),
  ].filter((item): item is string => item !== null)
  const improvements = [
    combineFinding(raw.improvement_1_finding, raw.improvement_1_evidence, raw.improvement_1_example),
    combineFinding(raw.improvement_2_finding, raw.improvement_2_evidence, raw.improvement_2_example),
    combineFinding(raw.improvement_3_finding, raw.improvement_3_evidence, raw.improvement_3_example),
  ].filter((item): item is string => item !== null)
  const prospects = sanitizeStrings([raw.prospect_1, raw.prospect_2])

  if (strengths.length !== 2) throw new Error('Expected exactly 2 strengths')
  if (improvements.length !== 3) throw new Error('Expected exactly 3 areas to improve')
  if (prospects.length !== 2) throw new Error('Expected exactly 2 prospects')

  if (detectedLanguage !== 'en' && looksLikeEnglish([...strengths, ...improvements, ...prospects].join(' '))) {
    throw new Error(`Content language did not match detected language "${detectedLanguage}"`)
  }

  // The model self-reports any candidate fact it introduced beyond the
  // original CV (new_claims_introduced, required by the schema). A non-empty
  // report is treated as a failed generation and retried, rather than
  // trusting the "do not invent" prompt instructions alone.
  const newClaims = Array.isArray(raw.new_claims_introduced)
    ? raw.new_claims_introduced.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
  if (newClaims.length > 0) {
    throw new Error(`Model reported unverified claims not present in the original CV: ${JSON.stringify(newClaims)}`)
  }

  if (
    !isFiniteNumber(raw.experience_score) ||
    !isFiniteNumber(raw.skills_score) ||
    !isFiniteNumber(raw.uvp_score)
  ) {
    throw new Error('Missing or invalid scores')
  }

  const experienceScore = clampScore(raw.experience_score)
  const skillsScore = clampScore(raw.skills_score)
  const uvpScore = clampScore(raw.uvp_score)
  const weighted = 0.4 * experienceScore + 0.35 * skillsScore + 0.25 * uvpScore

  return {
    interview_probability_score: Math.round(weighted),
    experience_score: experienceScore,
    skills_score: skillsScore,
    uvp_score: uvpScore,
    strengths,
    improvements,
    prospects,
    detected_language: detectedLanguage,
    job_title: typeof raw.job_title === 'string' && raw.job_title.trim() ? raw.job_title.trim() : null,
    company_name: typeof raw.company_name === 'string' && raw.company_name.trim() ? raw.company_name.trim() : null,
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
 * Strengths and areas to improve arrive as separate finding/evidence(/example)
 * schema fields (so the model can't skip the evidence half — see the JSON
 * schema's required list) and get joined back into a single
 * "Finding. Evidence. Example: ..." string here, which is what the Feedback
 * page's splitFinding() expects in order to bold the finding and render the
 * rest (evidence and, when present, the example) as plain text.
 */
function combineFinding(finding: unknown, evidence: unknown, example?: unknown): string | null {
  if (typeof finding !== 'string' || typeof evidence !== 'string') return null

  const cleanFinding = stripDashes(finding.trim()).replace(/[.!?]+$/, '')
  const cleanEvidence = stripDashes(evidence.trim())
  if (!cleanFinding || !cleanEvidence) return null

  const cleanExample = typeof example === 'string' ? stripDashes(example.trim()) : ''
  const evidenceSentence = cleanEvidence.match(/[.!?]$/) ? cleanEvidence : `${cleanEvidence}.`

  return cleanExample
    ? `${cleanFinding}. ${evidenceSentence} Example: ${cleanExample}`
    : `${cleanFinding}. ${cleanEvidence}`
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
