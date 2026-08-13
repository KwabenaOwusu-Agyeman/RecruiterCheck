import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { Buffer } from 'node:buffer'
import mammoth from 'npm:mammoth@1.8.0'
import { extractText as extractPdfText, getDocumentProxy } from 'npm:unpdf@0.12.1'
import { normalizeAnalysis, type AnalysisResult, type RawAnalysis } from './logic.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://recruitercheck.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_CV_CHARS = 15000
const MAX_ATTEMPTS = 3
const OPENAI_TIMEOUT_MS = 45000
const PARSE_TIMEOUT_MS = 15000
// Actual enforcement of the daily limit lives in the reserve_check_analysis
// Postgres function (see migration add_reserve_check_analysis_rpc), which
// atomically checks and reserves a slot under a row lock — these constants
// exist here only to build the matching user-facing error messages; keep
// them in sync with the limits hardcoded in that function.
const PAID_TIER_DAILY_LIMIT = 8
const FREE_TIER_LIFETIME_LIMIT = 1

interface AnalyzeRequest {
  checkId: string
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

/**
 * Checks the downloaded blob's actual leading bytes against the type
 * extractText is about to dispatch on — defense in depth on top of the
 * bucket's own allowed_mime_types restriction, in case a row was ever
 * uploaded with a mismatched declared type. text/plain has no reliable
 * signature, so it's skipped.
 */
function hasValidMagicBytes(bytes: Uint8Array, isPdf: boolean, isDocx: boolean): boolean {
  if (isPdf) {
    return (
      bytes.length >= 5 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46 &&
      bytes[4] === 0x2d
    )
  }
  if (isDocx) {
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
  }
  return true
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ])
}

async function extractText(file: Blob, fileName: string): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)

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

  if (!hasValidMagicBytes(bytes, isPdf, isDocx)) {
    throw new Error('File content does not match its declared type')
  }

  let text: string

  if (isPdf) {
    const pdf = await withTimeout(getDocumentProxy(bytes), PARSE_TIMEOUT_MS, 'PDF parsing')
    const result = await withTimeout(extractPdfText(pdf, { mergePages: true }), PARSE_TIMEOUT_MS, 'PDF text extraction')
    text = Array.isArray(result.text) ? result.text.join('\n') : result.text
  } else if (isDocx) {
    const result = await withTimeout(
      mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) }),
      PARSE_TIMEOUT_MS,
      'DOCX parsing',
    )
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
      return normalizeAnalysis(raw, cvText)
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
  const systemPrompt = `You are an experienced, technically rigorous recruiter screening a candidate's application. You do not choose a final score yourself — you extract and classify job requirements and match each one against CV evidence, and the application deterministically calculates the score from your classifications. Your job is EXTRACT + CLASSIFY + MATCH EVIDENCE, nothing more.

MyRecruiterCheck evaluates what the CV proves against this specific job, not everything the candidate might actually know or have done. "No evidence" always means "the CV does not show this," never "the candidate definitely lacks this." Keep that distinction in mind for every classification and every piece of feedback you write.

== STEP 1: EXTRACT AND CLASSIFY REQUIREMENTS ==

Read the job description and extract the distinct requirements that matter for this role. For each one, populate one entry in "requirements" with:

- requirement: a short, specific description of the requirement (e.g. "5+ years in B2B product marketing", "Experience with Salesforce").
- category: "experience" (work history, seniority, scope, domain, industry background, years, responsibilities) or "skills" (hard skills, tools, software, technical or job specific competencies, explicitly required soft skills).
- importance: one of "must_have", "important", "nice_to_have".
  - must_have: explicitly required by the employer or clearly fundamental to performing the role (look for language like "required", "must have", "minimum", "mandatory", "essential"). Do not automatically classify everything under a "Requirements" heading as must_have just because of where it appears — only what is actually required or clearly fundamental.
  - important: materially relevant to doing the job well, but not clearly disqualifying if absent.
  - nice_to_have: preferred or bonus (look for language like "preferred", "advantageous", "bonus", "nice to have").
- critical: true only when missing this specific requirement could reasonably make the candidate fundamentally ineligible or unable to do the role at all (a legally required licence, a mandatory professional registration or qualification, a mandatory language, explicit legal work eligibility, a truly fundamental specialist capability, or an explicitly required minimum experience that is clearly central to eligibility). Be conservative: generic requirements like communication, teamwork, attention to detail, or stakeholder management are never critical, even if the posting calls them required. Most requirements, including most must_have ones, should have critical = false.
- match_strength: "strong", "partial", or "none", based only on what the CV actually shows:
  - strong: the CV contains clear, direct evidence that satisfies the requirement.
  - partial: the CV contains related, transferable, or incomplete evidence that does not fully demonstrate the requirement.
  - none: no reasonable supporting evidence exists in the CV.
  Never infer a match from a job title, a general assumption about what a profession "usually" involves, or what someone in that role "probably" has. If the CV does not actually say it or clearly show it, the match is not strong or partial. A skill named in the job description that the CV never mentions is "none," even if a related or adjacent skill is present — a genuinely related, transferable skill can support "partial" only when it is itself explicitly present in the CV.
  A match must never be downgraded because an achievement lacks numbers or metrics. Quantification is a presentation quality issue, not a fit issue — if the CV clearly shows the candidate did the thing, that is strong or partial evidence regardless of whether the result was quantified. Never reduce a match, and never reuse the same "not quantified" observation to justify a lower match on a different requirement.
- cv_evidence: for a strong or partial match, copy a short excerpt of the CV's own text that supports it, word for word (trimming to the relevant sentence or clause is fine, and minor whitespace cleanup is fine) — do not rewrite it into your own words or summarize it, since a rephrased version can no longer be verified against the original. Never invent an excerpt that is not genuinely present in the CV, and never let the excerpt state a fact, number, tool, or qualification the CV itself does not state. If the CV shows only related or transferable evidence rather than the exact thing requested (for example the requirement is Odoo but the CV only shows SAP), quote what the CV actually says (the SAP text) and let match_strength (e.g. "partial") carry the transferability judgment — never substitute the requirement's own terminology into the quote. For a "none" match, leave this as an empty string.

Extract only requirements that are actually stated or clearly implied by the job description — never invent a requirement the posting does not raise, even for a short posting. Do not create duplicate or near duplicate entries for the same underlying requirement (e.g. do not list "5 years experience" and "significant prior experience" separately if the posting only raises one such requirement) — merge them into a single entry. Focus on the requirements that actually define whether this candidate fits the role; extract roughly 6 to 12 total across both categories for a typical posting, fewer for a very narrow one, never dozens of near identical entries.

== STEP 2: UVP (UNIQUE VALUE PROPOSITION) ==

UVP is separate from the requirement matrix above. It answers "why choose this candidate over another qualified candidate?" using an Evidence → Strength → Employer Value framework: find concrete evidence in the CV, translate it into a genuine strength, and explain the value it offers this specific employer.

Look only for evidence that goes beyond simply meeting the role's basic requirements: measurable outcomes, unusually relevant domain experience, significant leadership or scope, repeated demonstrated performance, unusually strong alignment with the employer's specific problem, an uncommon combination of relevant capabilities, or clearly significant business, customer, or operational impact. Do not reward generic traits (motivated, hardworking, passionate, team player, good communicator) unless there is meaningful evidence demonstrating real employer value behind them.

Do not double count: a fact that establishes basic qualification (e.g. "6 years of product marketing experience") primarily supports the experience requirements above, and should not by itself also earn strong UVP. It can support UVP only when the CV shows something beyond the basic qualification, such as documented results, scope, or differentiation that a similarly qualified candidate would not typically have (e.g. that same 6 years plus a specific launch with a documented commercial result).

Populate:
- uvp_evidence_level: "strong" (clear, relevant evidence that materially distinguishes this candidate), "partial" (some relevant differentiating evidence, but limited, weakly demonstrated, or only partially relevant), or "none" (no meaningful evidence showing why this candidate stands out from another basically qualified candidate).
- uvp_evidence: for "strong" or "partial", copy a short excerpt of the CV's own text supporting that level, word for word — the same rule as cv_evidence above: never rewrite it into your own words, and never let it state a number, outcome, or scope the CV itself does not state. For "none", an empty string.

== STEP 3: EXTRACTION AND CONTEXT ==

Also populate job_title and company_name: ${
    context.jobTitle || context.companyName
      ? `these are already known (job_title: ${context.jobTitle ?? 'unknown'}, company_name: ${context.companyName ?? 'unknown'}) — return them back exactly as given for whichever one is known; only extract the other one yourself if it says "unknown" above.`
      : 'extract both directly from the job description text.'
  } job_title is the specific role title as literally stated in the job description (e.g. "Senior Backend Engineer"), not a paraphrase. company_name is the hiring company's name as literally stated. If the job description genuinely does not state one of these clearly (e.g. a confidential/blind posting with no company named, or phrasing too generic to name a specific title), return an empty string for that field rather than guessing or inventing a plausible-sounding value — an empty string is always safer than a wrong guess here.

Write every field entirely in English, regardless of what language the job description or CV are written in.

Then write feedback that helps the candidate see their own application the way a recruiter would — direct, specific, evidence-based, technical, and never generic. This feedback must be grounded in the same requirement matrix and UVP evidence you just produced, not a fresh, independent impression of the CV. Each strength and area to improve is split into two separate fields: a "_finding" field and an "_evidence" field. When a feedback item is used, both fields must be non empty, and the evidence must add genuinely new information rather than restating the finding. When there is no evidence based item for a slot, return an empty string for all fields in that slot. The "_finding" field is a 2 to 5 word bolded lead-in naming the pattern or action, e.g. "Strong sales performance" or "Quantify your impact" (no trailing period needed, it will be rendered as a heading). The matching "_evidence" field is one full sentence giving the detail behind it, e.g. "Your record of exceeding sales targets directly supports the role's revenue expectations."
- strength_1_finding / strength_1_evidence and strength_2_finding / strength_2_evidence: include up to two genuine strengths. Base these primarily on requirements you marked "strong" and, where relevant, on "strong" or "partial" UVP evidence. Never invent a strength to fill both slots. If only one genuine strength exists, leave the second slot empty. If none exist, leave both slots empty. The finding names the underlying pattern that makes the CV effective, the way a recruiter commenting on craft would. Never restate or quote a specific achievement bullet from the CV in the finding — the candidate already knows what they wrote, so quoting it back adds nothing. The evidence states why that pattern specifically matters to this employer for this role (the Employer Value step of the Evidence, Strength, Employer Value framework). If there's genuinely no quantification anywhere, base strengths on other real craft signals present (e.g. clear ownership/scope language, relevant tools named, well-structured bullets) — never invent a pattern that isn't there.
- improvement_1_finding / improvement_1_evidence / improvement_1_example, improvement_2_finding / improvement_2_evidence / improvement_2_example, and improvement_3_finding / improvement_3_evidence / improvement_3_example: include only genuine improvements grounded in requirements marked "partial" or "none", or real presentation weaknesses. Never invent a weakness to fill all three slots. If no material improvement exists, return an empty string for every improvement field. If only one or two exist, fill only those slots and leave the remaining improvement fields empty. For a very strong application, prioritize only the single most useful refinement. The finding is a direct, imperative action, e.g. "Quantify your impact" or "Strengthen leadership evidence." Never hedge with phrasing like "Consider adding", "You may want to", or "It would be helpful to". The evidence states the specific improvement to make. Address quantification only when the CV genuinely lacks useful metrics. Push the candidate to elaborate on the most relevant experience only when it is genuinely too shallow for this role. The example field is optional and should use generic placeholders such as X%, €X, X customers, or X hours, never an invented number. Phrase gaps as what the CV does not show rather than as a claim about what the candidate lacks in real life.
- prospect_1 and prospect_2: include up to two plain, concise, evidence based sentences. Use one sentence on why the candidate can still be competitive for this role or closely related roles, and one sentence on which single improvement would most increase interview likelihood, but only when the requirement matrix supports each statement. Leave any unsupported slot empty rather than adding generic encouragement.

Finally, self check your own output and populate new_claims_introduced: a JSON array of any specific fact (a metric, employer name, date, credential, or achievement) that you stated about the candidate anywhere in strengths, improvements, or prospects that is not actually present in the original CV text. Placeholder values like "X%" are never claims and must never appear in this list. If, after careful review, you introduced no such fact, return an empty array.

Never use hyphens, en dashes, or em dashes anywhere in your output text (no "-", "–", or "—", including inside compound words). Write in plain sentences instead, using commas, periods, or separate words (e.g. "well structured" not "well-structured", "data driven" not "data-driven").`

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
      // 0, not the previous 0.4 — requirement classification, evidence
      // matching, and UVP evidence level feed directly into the
      // deterministic score formula below, so this call must vary as little
      // as possible run to run. The feedback prose sharing this same call
      // inherits temperature 0 too rather than splitting into a second call,
      // which the audit's own "smallest safe implementation path" guidance
      // favors over adding a second network round trip for this.
      temperature: 0,
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
              job_title: {
                type: 'string',
                description: 'The role title as literally stated in the job description, or an empty string if not clearly stated.',
              },
              company_name: {
                type: 'string',
                description: "The hiring company's name as literally stated in the job description, or an empty string if not clearly stated.",
              },
              requirements: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    requirement: { type: 'string' },
                    category: { type: 'string', enum: ['experience', 'skills'] },
                    importance: { type: 'string', enum: ['must_have', 'important', 'nice_to_have'] },
                    critical: { type: 'boolean' },
                    match_strength: { type: 'string', enum: ['strong', 'partial', 'none'] },
                    cv_evidence: {
                      type: 'string',
                      description: 'A short excerpt of the CV\'s own text, word for word, supporting a strong or partial match. Empty string for a none match.',
                    },
                  },
                  required: ['requirement', 'category', 'importance', 'critical', 'match_strength', 'cv_evidence'],
                  additionalProperties: false,
                },
                description: 'The extracted, classified job requirements with their CV match. The application calculates experience and skills scores from this, not the model.',
              },
              uvp_evidence_level: { type: 'string', enum: ['strong', 'partial', 'none'] },
              uvp_evidence: {
                type: 'string',
                description: 'A short excerpt of the CV\'s own text, word for word, supporting the UVP evidence level. Empty string for none.',
              },
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
              'job_title',
              'company_name',
              'requirements',
              'uvp_evidence_level',
              'uvp_evidence',
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
