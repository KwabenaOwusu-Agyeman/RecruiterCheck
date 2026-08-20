import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { Buffer } from 'node:buffer'
import { zipSync } from 'npm:fflate@0.8.2'
import mammoth from 'npm:mammoth@1.8.0'
import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb } from 'npm:pdf-lib@1.17.1'
import { extractText as extractPdfText, getDocumentProxy } from 'npm:unpdf@0.12.1'
import {
  validateDocuments,
  type RawDocuments,
  type TailoredCv,
  type CoverLetter,
  type RecruiterMessage,
} from './logic.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://recruitercheck.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_CV_CHARS = 15000
const MAX_ATTEMPTS = 3
const SIGNED_URL_TTL_SECONDS = 300
const OPENAI_TIMEOUT_MS = 45000
const PARSE_TIMEOUT_MS = 15000
const RATE_LIMIT_BUCKET = 'generate-documents'
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_SECONDS = 3600

// Brand blue (tailwind.config.js `blue`), reused so generated PDFs match the app.
const BLUE = rgb(0x19 / 255, 0x4a / 255, 0x9f / 255)
const BLACK = rgb(0.02, 0.02, 0.05)

interface GenerateRequest {
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
      return jsonResponse({ error: 'Document generation is not configured' }, 503)
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

    const { checkId } = (await req.json()) as GenerateRequest
    if (!checkId) {
      return jsonResponse({ error: 'checkId is required' }, 400)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // Each call re-runs a full OpenAI generation and re-parses the CV, so an
    // unbounded number of calls per user is a real cost/availability
    // concern, not just a theoretical one — cap it before doing any of that
    // work.
    const { data: rateLimitAllowed, error: rateLimitError } = await adminClient.rpc(
      'check_and_record_rate_limit',
      {
        p_user_id: user.id,
        p_bucket: RATE_LIMIT_BUCKET,
        p_limit: RATE_LIMIT_MAX,
        p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
      },
    )

    if (rateLimitError) {
      console.error('generate-documents: rate limit check failed', rateLimitError)
      return jsonResponse({ error: 'Could not process this request. Please try again.' }, 500)
    }

    if (!rateLimitAllowed) {
      return jsonResponse({ error: 'Too many document generation requests. Please try again later.' }, 429)
    }

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('subscription_tier')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return jsonResponse({ error: 'Profile not found' }, 404)
    }

    // Document entitlement escalates by plan: Starter (and Free) get no
    // generated documents, Active gets the improved CV draft only, Power
    // gets the full kit (CV draft, cover letter, recruiter message). Kept
    // in sync with PRICING_PLANS in src/lib/constants.ts.
    const tier = profile.subscription_tier as 'free' | 'starter' | 'active' | 'power'
    const entitlement = {
      cv: tier === 'active' || tier === 'power',
      coverLetter: tier === 'power',
      recruiterMessage: tier === 'power',
    }

    if (!entitlement.cv) {
      return jsonResponse(
        { error: 'Documents are available on the Active plan or higher. Upgrade to unlock your improved CV draft.' },
        403,
      )
    }

    const { data: check, error: checkError } = await adminClient
      .from('checks')
      .select('*, feedback(*)')
      .eq('id', checkId)
      .eq('user_id', user.id)
      .single()

    if (checkError || !check) {
      return jsonResponse({ error: 'Check not found' }, 404)
    }

    if (check.status !== 'completed') {
      return jsonResponse({ error: 'This check has not completed analysis yet' }, 400)
    }

    // A score of 60 or below is "Not a Fit" (see getScoreLabel in
    // src/lib/scoring.ts) — generating a polished CV draft, cover letter, and
    // recruiter message for a role the candidate's CV doesn't support would
    // be bad advice, not helpful. This applies to every tier, independent of
    // the plan-based entitlement check above.
    const MIN_DOCUMENT_SCORE = 61
    if (
      typeof check.interview_probability_score !== 'number' ||
      check.interview_probability_score < MIN_DOCUMENT_SCORE
    ) {
      return jsonResponse(
        {
          error:
            'Documents are only generated for a score of 61 or above. A lower score means this role is not a strong match for your CV.',
        },
        403,
      )
    }

    const feedbackRow = Array.isArray(check.feedback) ? check.feedback[0] : check.feedback
    if (!feedbackRow) {
      return jsonResponse({ error: 'No feedback available for this check' }, 400)
    }

    const { data: cvFile, error: downloadError } = await adminClient.storage
      .from('cvs')
      .download(check.cv_storage_path)

    if (downloadError || !cvFile) {
      console.error('generate-documents: CV download failed', { checkId, message: downloadError?.message })
      return jsonResponse({ error: 'Could not read CV file' }, 400)
    }

    let cvText: string
    try {
      cvText = await extractText(cvFile, check.cv_file_name)
    } catch (error) {
      console.error('generate-documents: CV parsing failed', {
        checkId,
        fileName: check.cv_file_name,
        message: error instanceof Error ? error.message : String(error),
      })
      return jsonResponse({ error: 'Could not read text from this CV file' }, 400)
    }

    const docs = await generateDocuments(openaiApiKey, cvText, check.job_description, {
      jobTitle: check.job_title,
      companyName: check.company_name,
      strengths: feedbackRow.strengths as string[],
      // The example clause (e.g. "Example: X% within X months") exists to
      // show a human reader on the Feedback page what a stronger bullet
      // could look like, using generic placeholders — it is never a value to
      // fill in. Strip it before this reaches the generator so a placeholder
      // like "X%" can't get echoed straight into a real document.
      improvements: (feedbackRow.improvements as string[]).map(stripExampleClause),
      prospects: feedbackRow.prospects as string[],
    })

    // The OpenAI call above always produces all three documents in one shot
    // (the prompt/schema aren't split by tier — cheaper to keep one call than
    // to maintain a second schema for a lesser bundle), but only the
    // entitled subset is rendered, stored, and returned below.
    const basePath = `${user.id}/${checkId}`
    const files: Record<string, Uint8Array> = {}

    const cvPdf = await renderCvPdf(docs.tailored_cv)
    files['CV.pdf'] = cvPdf
    await uploadFile(adminClient, `${basePath}/CV.pdf`, cvPdf, 'application/pdf')

    let coverLetterPdf: Uint8Array | null = null
    let emailForRecruiterPdf: Uint8Array | null = null

    if (entitlement.coverLetter) {
      coverLetterPdf = await renderCoverLetterPdf(docs.cover_letter, docs.tailored_cv, check.company_name)
      files['Cover Letter.pdf'] = coverLetterPdf
      await uploadFile(adminClient, `${basePath}/Cover Letter.pdf`, coverLetterPdf, 'application/pdf')
    }

    if (entitlement.recruiterMessage) {
      emailForRecruiterPdf = await renderRecruiterEmailPdf(docs.recruiter_message, docs.tailored_cv.full_name)
      files['Email for Recruiter.pdf'] = emailForRecruiterPdf
      await uploadFile(
        adminClient,
        `${basePath}/Email for Recruiter.pdf`,
        emailForRecruiterPdf,
        'application/pdf',
      )
    }

    const cvUrl = await signedUrl(adminClient, `${basePath}/CV.pdf`)
    const coverLetterUrl = coverLetterPdf
      ? await signedUrl(adminClient, `${basePath}/Cover Letter.pdf`)
      : undefined
    const emailForRecruiterUrl = emailForRecruiterPdf
      ? await signedUrl(adminClient, `${basePath}/Email for Recruiter.pdf`)
      : undefined

    // A zip only adds value once there's more than one file to bundle.
    let zipUrl: string | undefined
    if (Object.keys(files).length > 1) {
      const zip = zipSync(files)
      await uploadFile(adminClient, `${basePath}/Documents.zip`, zip, 'application/zip')
      zipUrl = await signedUrl(adminClient, `${basePath}/Documents.zip`)
    }

    return jsonResponse({
      cv: cvUrl,
      coverLetter: coverLetterUrl,
      emailForRecruiter: emailForRecruiterUrl,
      zip: zipUrl,
    })
  } catch (error) {
    console.error('generate-documents error:', error)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})

async function uploadFile(
  client: ReturnType<typeof createClient>,
  path: string,
  data: Uint8Array,
  contentType: string,
) {
  const { error } = await client.storage.from('documents').upload(path, data, {
    upsert: true,
    contentType,
  })
  if (error) throw error
}

async function signedUrl(client: ReturnType<typeof createClient>, path: string): Promise<string> {
  const { data, error } = await client.storage
    .from('documents')
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error || !data) throw error ?? new Error('Could not create signed URL')
  return data.signedUrl
}

/**
 * Checks the downloaded blob's actual leading bytes against the type
 * extractText is about to dispatch on — see the matching comment in
 * analyze-check/index.ts. text/plain has no reliable signature, so it's
 * skipped.
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
  // file name — see the matching comment in analyze-check/index.ts.
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
    text = new TextDecoder('utf-8').decode(arrayBuffer)
  } else {
    throw new Error('Unsupported file type')
  }

  const cleaned = text.replace(/\s+/g, ' ').trim()
  return cleaned.slice(0, MAX_CV_CHARS)
}

/**
 * Areas to improve are stored as "Finding. Evidence. Example: ...", where the
 * example clause exists only to show a human reader on the Feedback page what
 * a stronger bullet could look like, using generic placeholders like "X%".
 * The document generator must act on the finding/evidence, never copy the
 * placeholder itself into a real document, so this strips the clause before
 * the text reaches the prompt.
 */
function stripExampleClause(text: string): string {
  return text.replace(/\s*Example:\s*[\s\S]*$/i, '').trim()
}

async function generateDocuments(
  apiKey: string,
  cvText: string,
  jobDescription: string,
  context: {
    jobTitle: string | null
    companyName: string | null
    strengths: string[]
    improvements: string[]
    prospects: string[]
  },
): Promise<RawDocuments> {
  const attemptErrors: string[] = []

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const raw = await callOpenAI(apiKey, cvText, jobDescription, context)
      return validateDocuments(raw)
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
  context: {
    jobTitle: string | null
    companyName: string | null
    strengths: string[]
    improvements: string[]
    prospects: string[]
  },
): Promise<RawDocuments> {
  const systemPrompt = `You are an expert career writer helping a candidate present their strongest possible application for a specific role. Using their CV and the job description, produce three documents. Write as if the candidate is seeing their application the way a recruiter would, and use the recruiter's own assessment (strengths, areas to improve, and prospects) to sharpen the framing — lean into the strengths, and address the improvement areas constructively without being defensive. Do not invent experience, employers, dates, or credentials that are not in the original CV.

MyRecruiterCheck diagnoses first; these documents implement that diagnosis only where the candidate's own CV supports it. For every recruiter identified area to improve listed below, decide which case it falls into before writing, in this exact order, and record your decision in improvement_classifications (see below), one entry per area to improve, in the same order they are listed: (A) the original CV already contains the supporting fact (a number, a scope, an outcome) needed to address it, so rewrite the relevant part of the tailored_cv, cover_letter, or recruiter_message to surface that fact clearly and prominently; (B) the original CV has related detail but not the specific number or outcome the improvement calls for, so strengthen the wording, structure, or prioritization without adding any number or outcome that was not stated; (D) the improvement is not something a CV experience bullet could ever represent, such as confirming availability, shift flexibility, salary expectations, or other logistics the candidate would state directly to the employer rather than on a CV, so take no document action for it; (C) none of A, B, or D apply, meaning the original CV has no relevant evidence at all for that improvement and it is the kind of skill, experience, training, or quality a CV bullet can state: for cover_letter and recruiter_message, leave it unaddressed exactly as before — never invent supporting evidence in those two documents. For tailored_cv only, this case must still be reflected: add one new experience bullet to the most relevant entry that addresses the improvement, and set that bullet's is_placeholder field to true. This is not optional: every area to improve you classify as case (C) must produce exactly one such bullet, with no exceptions. What the bullet actually says depends on what the improvement is missing, and there is no single required wording: if it calls for a metric or outcome, bracket the unverifiable number, e.g. "Implemented a new onboarding system that led to a [X%] increase in efficiency over [X months]."; if it calls for a qualitative fact the CV doesn't show (training, a certification, a language course, a specific tool), bracket a short generic description of that missing detail instead of inventing a specific real sounding name for it, e.g. "Completed a [relevant hospitality or language training course] to strengthen guest communication and service standards."; if the improvement is really asking for a genuine attitude, framing, or value statement rather than a fact at all (e.g. conveying enjoyment of the work, or a general disposition), just write that statement directly and honestly in the candidate's own voice, with no bracket needed, since it is not an unverified claim to disclose, e.g. "Finds genuine satisfaction in creating clean, welcoming spaces that guests can relax in." Whichever shape fits, is_placeholder must still be set to true on that bullet, since it is content the CV itself does not support and the candidate should review before submitting — but never invent a bracket where the sentence does not naturally need one. Never set is_placeholder true on any other bullet, and never use bracketed placeholder text anywhere outside a bullet marked is_placeholder: true. Never force every area to improve into cover_letter or recruiter_message — only tailored_cv gets this forced treatment for case (C). Improve the presentation of the candidate's history, never the history itself, except for the sanctioned placeholder bullet described above. The prospects below are read only context on how competitive the candidate is and what would most increase interview odds — they may inform tone and emphasis but must never be copied as findings and must never introduce a claim the CV does not support.

Write all three documents entirely in English, regardless of what language the job description or CV are written in.

Every document must be usable exactly as generated — the candidate should be able to submit this package to a real application with zero edits. Never write a bracketed or unfilled placeholder (e.g. "[Company Address]", "[Hiring Manager Name]", "[Recruiter's Name]") anywhere in any of the three documents. If a piece of information isn't available, omit it gracefully rather than leaving a placeholder for the candidate to fill in. This also applies to the recruiter identified areas to improve below: any illustrative placeholder they might imply (such as a generic "X%" style figure) is never a value to insert, quote, or otherwise carry into the generated documents, only real figures already present in the original CV may appear — with one narrow, deliberate exception: a tailored_cv experience bullet explicitly marked is_placeholder: true, produced by the case (C) instruction above, is allowed to contain a bracketed placeholder like "[X%]" or "[X months]" when the improvement is missing a fact or metric (never bracketed elsewhere). This exception applies to nothing else: not the professional summary, not any other CV field, not the cover letter, not the recruiter message, which must all still be submittable with zero edits.

1. tailored_cv: a structured, tailored CV for this specific role.
   - full_name: extract exactly from the original CV.
   - contact_line: build this from only the details that actually appear in the original CV (city/country, email, phone, LinkedIn URL), joined with " • ". Never insert a generic label like "LinkedIn URL", "Phone Number", or "Email" as a stand in for a value that is not present. If only some of these details exist in the original CV, include only those and omit the rest entirely.
   - section_labels: the four standard resume section headings: "Professional Summary", "Work Experience", "Education", "Languages".
   - professional_summary: required, never empty, and never more than exactly 3 sentences, written in third person without "I". This is entirely about the candidate, never the employer, so never mention the company name or reference "this role" or "this employer" anywhere in it. Follow an Evidence, Strength, Value framework: sentence 1 states concrete evidence of who the candidate is and their relevant experience (role, years, domain); sentence 2 names the core strength or pattern that evidence demonstrates; sentence 3 states the broader professional value or impact that strength delivers, described generically (e.g. "driving measurable revenue growth" or "building trusted client relationships"), not tied to any specific company. Keep each sentence short and direct.
   - experience: include up to 4 roles from the original CV, most relevant/recent first, favoring relevance to this job but leaning toward including more roles rather than fewer so the page fills out properly, the way a real one page resume does. If the candidate's original CV only has 2 or 3 roles total, include all of them (never invent a role that is not in the original CV) and instead add more depth: more bullets per entry (up to the 4 bullet limit) and more concrete detail drawn from the original CV, so the page still reads as full and substantive rather than sparse. Each entry needs a concise, tailored title, "company, location" (comma separated, not a dash), "dates" (preserve month and year exactly as given in the original CV when the original CV includes the month, e.g. "January 2023 to Present", not just the year), and 3-4 short bullets rewritten to foreground what matters for this role.
   - Absolute rule, more important than filling space: every fact in every bullet, including every number, percentage, dollar amount, count, or timeframe, must be traceable to something actually stated in the original CV, with the single exception of a bullet you've marked is_placeholder: true, whose entire purpose is holding space for an area to improve the CV has no real evidence for. When you add depth or an extra bullet to make an entry richer, that added material must be a rephrasing, reprioritization, or elaboration of details already in the original CV text, e.g. surfacing a scope word like "team of 4" or a tool name that was mentioned but not emphasized. It must never be a new number or outcome you composed to sound more impressive, even a plausible sounding one like "achieving a 25% conversion rate" that was never in the source. If the original CV genuinely has no more real detail to draw out for a bullet, keep that bullet as is rather than padding it with an invented figure. Every bullet you write, including this placeholder bullet, must include the is_placeholder field.
   - Use the recruiter identified areas to improve provided below to actively guide how you rewrite the experience bullets, not just as background context: if an area to improve calls for more quantification, rework the relevant bullets to lead with whatever metrics, numbers, or concrete outcomes already exist in the original CV instead of burying them; if it calls for elaborating on a specific experience entry, give that entry more depth, more bullets (up to the 4 bullet limit), and more concrete detail than the others, drawing out relevant specifics from the original CV that were previously omitted or compressed. The goal is a fuller, richer looking entry for whichever role the feedback points to, not just a reworded one. Never invent a metric, outcome, or detail that is not actually present in the original CV — only re-prioritize, re-word, expand on, and bring forward what is already true.
   - education: only the most relevant 1-2 entries, with "dates" preserving month and year exactly as given in the original CV when the original CV includes the month.
   - languages: only include if present in the original CV, otherwise an empty array.
   - Do not include a skills list anywhere in the CV.
   - This CV must fit on a single printed page — be ruthlessly concise and omit anything not relevant to this job. Prioritize relevance over completeness.
2. cover_letter: a premium, professional cover letter for this role, written by the candidate, to the company, in the candidate's own voice. Write in clear, direct, plain language, no jargon and no filler, confident and positive throughout, exactly what a recruiter wants to read. This is the single most important rule for this document: write every sentence in the first person ("I", "my", "me"), exactly as the candidate would write it themselves. Never refer to the candidate by name or in the third person anywhere in intro_paragraph, body_paragraphs, or conclusion_paragraph (wrong: "Maya is excited to apply... She has..."; right: "I am excited to apply... I have..."). Structured as:
   - company_location: read the entire job description carefully, including the very start and end and any line near the job title or company name, for any statement of the company's location, such as "based in Berlin", "our Amsterdam office", "Remote, Netherlands", a city name next to the job title, or a full address line. If a location is found, extract it: format as "City, Country" when both are given, or just the city (or just the country) when only one is given. Only use an empty string if the job description truly contains no location information anywhere, after a careful full read. Do not invent a location that is not actually stated in the job description.
   - salutation: a natural formal greeting for a cover letter, addressed to the company's hiring team. The company name provided below (see "Company:" in the context) may be empty if it could not be determined from the job description — when it is empty, use a generic greeting to the hiring team with no company name in it (e.g. "Dear Hiring Team,"); when a company name is provided, substitute it in naturally. Never write a bracketed placeholder like "Dear <Company> Hiring Team," and never invent a company name that was not provided.
   - intro_paragraph: first person opening stating who I am and the role I'm applying for — a strong, direct hook.
   - body_paragraphs: exactly 3 short first person paragraphs, always in this order:
     1. Specific fit for this job's requirements, drawing on one real piece of experience and a concrete result or outcome from the CV.
     2. A second, different piece of specific fit evidence: another real skill, experience, or quantifiable result from the CV relevant to this job's requirements. Do not repeat the first paragraph's example. Start this paragraph with a natural transition word or phrase.
     3. Soft skills and working style, written as genuine, confident personal qualities relevant to being a good hire, for example collaborating well in a team while also working independently, strong time management with a habit of delivering ahead of schedule, and enthusiasm for contributing to team or company culture. Keep this authentic and specific, not generic corporate language. Start this paragraph with a natural transition word or phrase.
   - conclusion_paragraph: a short, confident closing paragraph with a clear call to action, expressing enthusiasm to discuss the role further. Do not include a final thank you sentence here — that goes in thank_you_line below.
   - thank_you_line: a single, natural sentence thanking them for considering the application (e.g. "Thank you for considering my application.") — kept separate from conclusion_paragraph so it always renders as its own closing line.
   - closing_phrase: a natural formal sign off used to close a letter (e.g. "Yours sincerely,") — the candidate's name is added separately as the signature on the next line, so do not include it here.
   - The letter has no header block (no name, contact details, or address at the top) — it begins directly with the date. Do not include a return address or salutation-block contact info.
   - The whole letter (intro + exactly 3 body paragraphs + conclusion + thank_you_line) must always fit on a single printed page, no exceptions — be concise in every paragraph.
3. recruiter_message: a short outreach message from the candidate to a recruiter or hiring manager for this role (e.g. via LinkedIn or email), written entirely in the first person ("I"), never referring to the candidate by name or in the third person, split into these separate fields:
   - greeting: a short greeting, on its own (e.g. "Hi,") — never a bracketed placeholder like "[Recruiter's Name]", since the recruiter's actual name isn't known.
   - body: exactly 3 short sentences as one block of text, in this order:
     a. State I have applied for this specific role.
     b. Convey genuine high interest, passion, and positivity for the role and company, tied to a real detail from the job description (not generic enthusiasm).
     c. Give exactly one specific, tangible reason I am the right fit, pulled fresh from the original CV and job description. Describe this in qualitative, text only terms, such as a concrete skill combination, relevant domain experience, or a genuine alignment with the company's mission or values. Never cite a number, percentage, or other statistic here, even if the CV has one (numbers belong in the CV itself, not this message). This sentence must be a fresh angle, not a restatement or paraphrase of anything in the recruiter identified strengths provided below — the goal is to make the recruiter want to open the attached CV, not repeat feedback they already have.
   - closing_line: a brief, warm closing sentence looking forward to hearing back (e.g. "I look forward to hearing from you.").
   - sign_off: a natural formal sign off used to close a short message (e.g. "Kind regards,") — the candidate's name is added separately as the signature on the next line, so do not include it here.

4. improvement_classifications: a JSON array with exactly one entry per item in "Recruiter identified areas to improve" below, in the same order, each an object with a single "case" field set to "A", "B", "C", or "D" per the classification you made for that area above. This is a mechanical record of the decisions you already made, not new analysis.

Never use hyphens, en dashes, or em dashes anywhere in any of the three documents (no "-", "–", or "—"). This is an absolute rule with no exceptions. This includes dates ("2020-2023"), job titles, and compound words and phrases that would default to a hyphen in English (such as "well-known", "data-driven", "problem-solving", "self-motivated", "detail-oriented", "cross-functional", "well-being", "ad-hoc", "up-to-date") — always write these as two separate words instead (e.g. "well known", "data driven", "problem solving"), and use a comma or "to" in date ranges (e.g. "2020 to 2023"). Before finalizing your answer, reread every sentence you wrote and remove any hyphen, en dash, or em dash you find.

Finally, self check your own output and populate new_claims_introduced: a JSON array of every number, percentage, currency amount, count, timeframe, employer name, job title, certification, or skill that appears anywhere in the tailored_cv, cover_letter, or recruiter_message above but is not a direct restatement, reordering, or rephrasing of something that actually appears in the original CV text provided below. This is an honest self audit, not a formality — go back through every bullet, every sentence, and every figure you wrote and verify it against the original CV. If you are not certain a specific detail traces back to the original CV, include it here rather than omitting it. Do not include the content of any bullet you marked is_placeholder: true in new_claims_introduced — that field is for undisclosed fabrication, and a placeholder bullet is disclosed via is_placeholder instead. Everything else you wrote, including every other CV bullet, must still go through this same audit as before. Return an empty array only if, after this careful check, truly nothing you wrote goes beyond what the original CV actually states (aside from any disclosed is_placeholder bullets).`

  const userPrompt = `Job title: ${context.jobTitle ?? 'Not specified'}
Company: ${context.companyName ?? 'Not specified'}

Job description:
${jobDescription}

Recruiter identified strengths:
${context.strengths.map((item) => `- ${item}`).join('\n')}

Recruiter identified areas to improve:
${context.improvements.map((item) => `- ${item}`).join('\n')}

Recruiter identified prospects (read only context, not instructions to implement):
${context.prospects.map((item) => `- ${item}`).join('\n')}

Original CV:
${cvText}`

  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.5,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'recruiter_check_documents',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              tailored_cv: {
                type: 'object',
                properties: {
                  full_name: { type: 'string' },
                  contact_line: { type: 'string' },
                  section_labels: {
                    type: 'object',
                    properties: {
                      summary: { type: 'string' },
                      experience: { type: 'string' },
                      education: { type: 'string' },
                      languages: { type: 'string' },
                    },
                    required: ['summary', 'experience', 'education', 'languages'],
                    additionalProperties: false,
                  },
                  professional_summary: { type: 'string' },
                  experience: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                        company_location: { type: 'string' },
                        dates: { type: 'string' },
                        bullets: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              text: { type: 'string' },
                              is_placeholder: { type: 'boolean' },
                            },
                            required: ['text', 'is_placeholder'],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ['title', 'company_location', 'dates', 'bullets'],
                      additionalProperties: false,
                    },
                  },
                  education: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        degree: { type: 'string' },
                        institution: { type: 'string' },
                        dates: { type: 'string' },
                      },
                      required: ['degree', 'institution', 'dates'],
                      additionalProperties: false,
                    },
                  },
                  languages: { type: 'array', items: { type: 'string' } },
                },
                required: [
                  'full_name',
                  'contact_line',
                  'section_labels',
                  'professional_summary',
                  'experience',
                  'education',
                  'languages',
                ],
                additionalProperties: false,
              },
              cover_letter: {
                type: 'object',
                properties: {
                  company_location: { type: 'string' },
                  salutation: { type: 'string' },
                  intro_paragraph: { type: 'string' },
                  body_paragraphs: { type: 'array', items: { type: 'string' } },
                  conclusion_paragraph: { type: 'string' },
                  thank_you_line: { type: 'string' },
                  closing_phrase: { type: 'string' },
                },
                required: [
                  'company_location',
                  'salutation',
                  'intro_paragraph',
                  'body_paragraphs',
                  'conclusion_paragraph',
                  'thank_you_line',
                  'closing_phrase',
                ],
                additionalProperties: false,
              },
              recruiter_message: {
                type: 'object',
                properties: {
                  greeting: { type: 'string' },
                  body: { type: 'string' },
                  closing_line: { type: 'string' },
                  sign_off: { type: 'string' },
                },
                required: ['greeting', 'body', 'closing_line', 'sign_off'],
                additionalProperties: false,
              },
              new_claims_introduced: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Every number, employer, date, credential, or skill in the three documents above that does not trace back to the original CV. Empty array only if none.',
              },
              improvement_classifications: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    case: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
                  },
                  required: ['case'],
                  additionalProperties: false,
                },
                description:
                  'One entry per item in "Recruiter identified areas to improve", same order, recording the A/B/C/D case decision made for it.',
              },
            },
            required: [
              'tailored_cv',
              'cover_letter',
              'recruiter_message',
              'new_claims_introduced',
              'improvement_classifications',
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
    throw new Error('Empty response from document generation service')
  }

  return JSON.parse(rawText) as RawDocuments
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

type DrawLine = {
  text: string
  size: number
  font: PDFFont
  color: ReturnType<typeof rgb>
  x: number
  advance: number
}

/**
 * Renders the CV at a given font/spacing scale and returns both the drawing
 * instructions and total height used, so the caller can try a few scales and
 * pick the largest one that still fits a single page (shrink-to-fit). Each
 * line carries its own `advance` (vertical space it consumes including any
 * gap that follows it), and the draw loop consumes the exact same advances —
 * so the height used to pick a scale always matches what actually gets drawn.
 */
function layoutCv(
  cv: TailoredCv,
  fonts: { regular: PDFFont; bold: PDFFont; italic: PDFFont },
  pageWidth: number,
  margin: number,
  scale: number,
): { lines: DrawLine[]; totalHeight: number } {
  const labels = cv.section_labels
  const maxWidth = pageWidth - margin * 2
  const nameSize = 22 * scale
  const contactSize = 10 * scale
  const headingSize = 14 * scale
  const jobTitleSize = 11.5 * scale
  const bodySize = 10 * scale
  const gapTiny = 4 * scale
  const gapSmall = 8 * scale
  const gapMedium = 14 * scale
  const gapSection = 16 * scale
  const lineHeight = bodySize * 1.4

  const lines: DrawLine[] = []
  let totalHeight = 0

  function push(text: string, size: number, font: PDFFont, color: ReturnType<typeof rgb>, x: number, extraGap = 0) {
    const advance = size * 1.3 + extraGap
    lines.push({ text, size, font, color, x, advance })
    totalHeight += advance
  }

  function addCentered(text: string, size: number, font: PDFFont, color: ReturnType<typeof rgb>, extraGap = 0) {
    const width = font.widthOfTextAtSize(text, size)
    push(text, size, font, color, margin + Math.max(0, (maxWidth - width) / 2), extraGap)
  }

  function addLeft(text: string, size: number, font: PDFFont, color: ReturnType<typeof rgb>, extraGap = 0) {
    push(text, size, font, color, margin, extraGap)
  }

  function addWrapped(text: string, size: number, font: PDFFont, color: ReturnType<typeof rgb>, extraGapAfter = 0) {
    const wrapped = wrapText(font, text, size, maxWidth)
    wrapped.forEach((wrappedLine, i) => {
      const advance = lineHeight
      const gap = i === wrapped.length - 1 ? extraGapAfter : 0
      lines.push({ text: wrappedLine, size, font, color, x: margin, advance: advance + gap })
      totalHeight += advance + gap
    })
  }

  function addBullet(text: string, size: number, font: PDFFont, color: ReturnType<typeof rgb>) {
    const bulletPrefix = '•  '
    const hangIndent = font.widthOfTextAtSize(bulletPrefix, size)
    const wrapped = wrapText(font, text, size, maxWidth - hangIndent)
    wrapped.forEach((wrappedLine, i) => {
      const displayText = i === 0 ? `${bulletPrefix}${wrappedLine}` : wrappedLine
      const x = i === 0 ? margin : margin + hangIndent
      lines.push({ text: displayText, size, font, color, x, advance: lineHeight })
      totalHeight += lineHeight
    })
  }

  addCentered(cv.full_name, nameSize, fonts.bold, BLUE, gapTiny)
  if (cv.contact_line) {
    addCentered(cv.contact_line, contactSize, fonts.regular, BLACK, gapMedium)
  }

  if (cv.professional_summary) {
    addLeft(labels.summary, headingSize, fonts.bold, BLACK, gapTiny)
    addWrapped(cv.professional_summary, bodySize, fonts.regular, BLACK, gapSection)
  }

  if (cv.experience.length > 0) {
    addLeft(labels.experience, headingSize, fonts.bold, BLACK, gapSmall)
    cv.experience.forEach((entry, index) => {
      addLeft(entry.title, jobTitleSize, fonts.bold, BLUE)
      if (entry.company_location) addLeft(entry.company_location, bodySize, fonts.regular, BLACK)
      addLeft(entry.dates || ' ', bodySize, fonts.regular, BLACK, gapTiny)
      entry.bullets.forEach((bullet) =>
        addBullet(bullet.text, bodySize, bullet.is_placeholder ? fonts.italic : fonts.regular, BLACK),
      )
      if (lines.length > 0) lines[lines.length - 1].advance += index < cv.experience.length - 1 ? gapMedium : gapSection
      totalHeight += index < cv.experience.length - 1 ? gapMedium : gapSection
    })
  }

  if (cv.languages.length > 0) {
    addLeft(labels.languages, headingSize, fonts.bold, BLACK, gapSmall)
    cv.languages.forEach((spokenLanguage) => addBullet(spokenLanguage, bodySize, fonts.regular, BLACK))
    if (lines.length > 0) lines[lines.length - 1].advance += gapSection
    totalHeight += gapSection
  }

  // Education always renders last, matching standard resume convention.
  if (cv.education.length > 0) {
    addLeft(labels.education, headingSize, fonts.bold, BLACK, gapSmall)
    cv.education.forEach((entry, index) => {
      addLeft(entry.degree, jobTitleSize, fonts.bold, BLUE)
      if (entry.institution) addLeft(entry.institution, bodySize, fonts.regular, BLACK)
      addLeft(entry.dates || ' ', bodySize, fonts.regular, BLACK, index < cv.education.length - 1 ? gapSmall : 0)
    })
  }

  return { lines, totalHeight }
}

// Draws a large, semi-transparent diagonal stamp across the page. This CV
// may contain case-(C) placeholder bullets (see layoutCv/is_placeholder) —
// unverified content the candidate must fill in with real numbers — so the
// document must never look submission-ready before that's done.
function drawDraftWatermark(page: PDFPage, font: PDFFont, pageWidth: number, pageHeight: number) {
  const watermarkText = 'DRAFT — NOT FOR SUBMISSION'
  const watermarkSize = 40
  const watermarkColor = rgb(0.55, 0.55, 0.55)
  const watermarkWidth = font.widthOfTextAtSize(watermarkText, watermarkSize)
  const angleRad = (45 * Math.PI) / 180

  page.drawText(watermarkText, {
    // pdf-lib rotates around (x, y) as the pivot, not the text's visual
    // center — offset the start point by half the text width along the
    // rotation direction so the rotated run lands centered on the page.
    x: pageWidth / 2 - (watermarkWidth / 2) * Math.cos(angleRad),
    y: pageHeight / 2 - (watermarkWidth / 2) * Math.sin(angleRad),
    size: watermarkSize,
    font,
    color: watermarkColor,
    opacity: 0.22,
    rotate: degrees(45),
  })
}

async function renderCvPdf(cv: TailoredCv): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const italic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)

  const pageWidth = 612
  const pageHeight = 792
  const margin = 48
  const usableHeight = pageHeight - margin * 2

  const scales = [1, 0.92, 0.85, 0.78, 0.72, 0.66]
  let chosen = layoutCv(cv, { regular, bold, italic }, pageWidth, margin, scales[scales.length - 1])

  for (const scale of scales) {
    const attempt = layoutCv(cv, { regular, bold, italic }, pageWidth, margin, scale)
    if (attempt.totalHeight <= usableHeight) {
      chosen = attempt
      break
    }
    chosen = attempt // keep the smallest-scale attempt as a fallback if nothing fits
  }

  const page = pdfDoc.addPage([pageWidth, pageHeight])
  let cursorY = pageHeight - margin

  for (const line of chosen.lines) {
    cursorY -= line.size * 1.05
    page.drawText(line.text, { x: line.x, y: cursorY, size: line.size, font: line.font, color: line.color })
    cursorY -= line.advance - line.size * 1.05
  }

  drawDraftWatermark(page, bold, pageWidth, pageHeight)

  return pdfDoc.save()
}

function formatLetterDate(): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(),
  )
}

/**
 * Same shrink-to-fit approach as layoutCv: measure at decreasing scales,
 * pick the largest that fits one page, and use the exact same per-line
 * advances for measuring and drawing.
 */
function layoutCoverLetter(
  letter: CoverLetter,
  cv: TailoredCv,
  companyName: string | null,
  fonts: { regular: PDFFont; bold: PDFFont },
  pageWidth: number,
  margin: number,
  scale: number,
  gapStretch = 1,
  lineStretch = 1,
): { lines: DrawLine[]; totalHeight: number; totalGap: number } {
  const maxWidth = pageWidth - margin * 2
  const bodySize = 11 * scale
  const metaSize = bodySize
  const gapSmall = 10 * scale
  const gapMedium = 16 * scale
  const gapHeader = 22 * scale
  const lineHeight = bodySize * 1.5 * lineStretch

  const lines: DrawLine[] = []
  let totalHeight = 0
  // Sum of the un-stretched extraGap amounts from stretchable calls only, so
  // the caller can work out how much extra spacing is available to distribute
  // if the letter runs short. Fixed elements (header block, salutation,
  // signature) never grow, so a short letter can't stretch into an
  // unprofessional-looking layout — only paragraph spacing flexes.
  let totalGap = 0

  // Conventional business-letter alignment: everything flush-left, ragged
  // right — the format a recruiter actually expects to read, not centered.
  // lineMultiplier defaults to a compact single-line advance (1.3); pass 1.5
  // (matching the paragraph line height below) for consecutive lines like the
  // address block or signature, so their vertical rhythm reads as normal text
  // spacing rather than cramped.
  function addLeft(
    text: string,
    size: number,
    font: PDFFont,
    color: ReturnType<typeof rgb>,
    extraGap = 0,
    stretchable = true,
    lineMultiplier = 1.3,
  ) {
    const appliedGap = stretchable ? extraGap * gapStretch : extraGap
    const advance = size * lineMultiplier + appliedGap
    lines.push({ text, size, font, color, x: margin, advance })
    totalHeight += advance
    if (stretchable) totalGap += extraGap
  }

  // Modified-block convention: the date sits right-aligned while the rest
  // of the letter stays flush-left.
  function addRight(
    text: string,
    size: number,
    font: PDFFont,
    color: ReturnType<typeof rgb>,
    extraGap = 0,
    stretchable = true,
  ) {
    const width = font.widthOfTextAtSize(text, size)
    const appliedGap = stretchable ? extraGap * gapStretch : extraGap
    const advance = size * 1.3 + appliedGap
    lines.push({ text, size, font, color, x: margin + maxWidth - width, advance })
    totalHeight += advance
    if (stretchable) totalGap += extraGap
  }

  function addParagraph(
    text: string,
    size: number,
    font: PDFFont,
    color: ReturnType<typeof rgb>,
    extraGapAfter = 0,
  ) {
    const wrapped = wrapText(font, text, size, maxWidth)
    wrapped.forEach((wrappedLine, i) => {
      const gap = i === wrapped.length - 1 ? extraGapAfter * gapStretch : 0
      lines.push({ text: wrappedLine, size, font, color, x: margin, advance: lineHeight + gap })
      totalHeight += lineHeight + gap
      if (i === wrapped.length - 1) totalGap += extraGapAfter
    })
  }

  const hasCompanyBlock = Boolean(companyName || letter.company_location)
  addRight(formatLetterDate(), metaSize, fonts.regular, BLACK, hasCompanyBlock ? gapHeader : gapMedium, false)

  // Recipient address block: company name, then city and country each on
  // their own line with no blank lines between them (standard block-letter
  // convention) — only the line after the block gets normal section spacing.
  const locationLines = letter.company_location
    ? letter.company_location.split(',').map((part) => part.trim()).filter(Boolean)
    : []
  if (companyName) {
    addLeft(companyName, metaSize, fonts.regular, BLACK, locationLines.length > 0 ? 0 : gapMedium, false, 1.5)
  }
  locationLines.forEach((line, i) => {
    const isLast = i === locationLines.length - 1
    addLeft(line, metaSize, fonts.regular, BLACK, isLast ? gapMedium : 0, false, 1.5)
  })

  if (letter.salutation) addLeft(letter.salutation, bodySize, fonts.bold, BLACK, gapSmall, false)

  addParagraph(letter.intro_paragraph, bodySize, fonts.regular, BLACK, gapSmall)
  letter.body_paragraphs.forEach((paragraph) => addParagraph(paragraph, bodySize, fonts.regular, BLACK, gapSmall))

  // thank_you_line is its own field from the model, not parsed out of
  // conclusion_paragraph — it always renders as its own closing line.
  addParagraph(letter.conclusion_paragraph, bodySize, fonts.regular, BLACK, gapSmall)
  addParagraph(letter.thank_you_line, bodySize, fonts.regular, BLACK, gapMedium)

  // No extra gap before the name — the signature sits directly under the
  // closing phrase at normal line spacing, exactly as a recruiter expects.
  addLeft(letter.closing_phrase, bodySize, fonts.regular, BLACK, 0, false, 1.5)
  addLeft(cv.full_name, bodySize, fonts.bold, BLACK, 0, false, 1.5)

  return { lines, totalHeight, totalGap }
}

async function renderCoverLetterPdf(
  letter: CoverLetter,
  cv: TailoredCv,
  companyName: string | null,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const pageWidth = 612
  const pageHeight = 792
  const margin = 64
  const usableHeight = pageHeight - margin * 2

  const scales = [1, 0.92, 0.85, 0.78, 0.72]
  let chosenScale = scales[scales.length - 1]
  let chosen = layoutCoverLetter(
    letter,
    cv,
    companyName,
    { regular, bold },
    pageWidth,
    margin,
    chosenScale,
  )

  for (const scale of scales) {
    const attempt = layoutCoverLetter(
      letter,
      cv,
      companyName,
      { regular, bold },
      pageWidth,
      margin,
      scale,
    )
    if (attempt.totalHeight <= usableHeight) {
      chosen = attempt
      chosenScale = scale
      break
    }
    chosen = attempt
    chosenScale = scale
  }

  // If the chosen layout leaves a large gap at the bottom of the page, spread
  // the extra room across both line spacing (a touch more leading reads as
  // deliberate, generous typesetting) and paragraph/section gaps, so the
  // letter fills the page evenly instead of trailing off after the signature.
  if (chosen.totalGap > 0 && chosen.totalHeight < usableHeight) {
    const lineStretchOptions = [1, 1.06, 1.12]
    let best = chosen

    for (const lineStretch of lineStretchOptions) {
      const base = layoutCoverLetter(
        letter,
        cv,
        companyName,
        { regular, bold },
        pageWidth,
        margin,
        chosenScale,
        1,
        lineStretch,
      )
      if (base.totalHeight > usableHeight) break

      const remaining = usableHeight - base.totalHeight
      const gapStretch = base.totalGap > 0 ? Math.min(1.7, 1 + remaining / base.totalGap) : 1
      const attempt = layoutCoverLetter(
        letter,
        cv,
        companyName,
        { regular, bold },
        pageWidth,
        margin,
        chosenScale,
        gapStretch,
        lineStretch,
      )
      if (attempt.totalHeight <= usableHeight && attempt.totalHeight > best.totalHeight) {
        best = attempt
      }
    }

    chosen = best
  }

  const page = pdfDoc.addPage([pageWidth, pageHeight])
  let cursorY = pageHeight - margin

  for (const line of chosen.lines) {
    cursorY -= line.size * 1.05
    page.drawText(line.text, { x: line.x, y: cursorY, size: line.size, font: line.font, color: line.color })
    cursorY -= line.advance - line.size * 1.05
  }

  return pdfDoc.save()
}

/**
 * Renders as an actual email/message would read: flush-left, no title
 * heading inside the document.
 */
async function renderRecruiterEmailPdf(message: RecruiterMessage, fullName: string): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const pageWidth = 612
  const pageHeight = 792
  const margin = 64
  const maxWidth = pageWidth - margin * 2
  const bodySize = 11
  const lineHeight = bodySize * 1.6

  let page = pdfDoc.addPage([pageWidth, pageHeight])
  let cursorY = pageHeight - margin

  function newPage() {
    page = pdfDoc.addPage([pageWidth, pageHeight])
    cursorY = pageHeight - margin
  }

  function drawLeft(text: string, size: number, drawFont: PDFFont, color: ReturnType<typeof rgb>) {
    if (cursorY < margin) newPage()
    page.drawText(text, { x: margin, y: cursorY, size, font: drawFont, color })
  }

  const paragraphs = [message.greeting, message.body, message.closing_line]

  for (const paragraph of paragraphs) {
    for (const line of wrapText(font, paragraph, bodySize, maxWidth)) {
      drawLeft(line, bodySize, font, BLACK)
      cursorY -= lineHeight
    }
    cursorY -= lineHeight * 0.6
  }

  cursorY -= lineHeight * 0.4
  drawLeft(message.sign_off, bodySize, font, BLACK)
  cursorY -= lineHeight
  drawLeft(fullName, bodySize, boldFont, BLACK)

  return pdfDoc.save()
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * A hung OpenAI request would otherwise be caught only by the platform's own
 * hard timeout, at an unpredictable point. Aborting deterministically at
 * OPENAI_TIMEOUT_MS lets this fail into the normal retry path instead.
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
