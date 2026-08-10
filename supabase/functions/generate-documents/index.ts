import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { Buffer } from 'node:buffer'
import { zipSync } from 'npm:fflate@0.8.2'
import mammoth from 'npm:mammoth@1.8.0'
import { PDFDocument, PDFFont, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'
import { extractText as extractPdfText, getDocumentProxy } from 'npm:unpdf@0.12.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_CV_CHARS = 15000
const MAX_ATTEMPTS = 3
const SIGNED_URL_TTL_SECONDS = 300
const OPENAI_TIMEOUT_MS = 45000

// Brand blue (tailwind.config.js `blue`), reused so generated PDFs match the app.
const BLUE = rgb(0x19 / 255, 0x4a / 255, 0x9f / 255)
const BLACK = rgb(0.02, 0.02, 0.05)

interface GenerateRequest {
  checkId: string
}

interface ExperienceEntry {
  title: string
  company_location: string
  dates: string
  bullets: string[]
}

interface EducationEntry {
  degree: string
  institution: string
  dates: string
}

interface SectionLabels {
  summary: string
  experience: string
  education: string
  languages: string
}

interface TailoredCv {
  full_name: string
  contact_line: string
  professional_summary: string
  experience: ExperienceEntry[]
  education: EducationEntry[]
  languages: string[]
  section_labels: SectionLabels
}

interface CoverLetter {
  company_location: string
  salutation: string
  intro_paragraph: string
  body_paragraphs: string[]
  conclusion_paragraph: string
  thank_you_line: string
  closing_phrase: string
}

interface RecruiterMessage {
  greeting: string
  body: string
  closing_line: string
  sign_off: string
}

interface RawDocuments {
  language: string
  tailored_cv: TailoredCv
  cover_letter: CoverLetter
  recruiter_message: RecruiterMessage
  new_claims_introduced: string[]
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

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('subscription_tier')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return jsonResponse({ error: 'Profile not found' }, 404)
    }

    if (profile.subscription_tier === 'free') {
      return jsonResponse({ error: 'Documents are a Premium feature' }, 403)
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
      improvements: feedbackRow.improvements as string[],
      // Reuse the language analyze-check already determined for this same
      // check rather than re-detecting — the two calls must never disagree.
      // Only checks completed before this feature shipped will lack it.
      detectedLanguage: check.detected_language,
    })

    const cvPdf = await renderCvPdf(docs.tailored_cv)
    const coverLetterPdf = await renderCoverLetterPdf(
      docs.cover_letter,
      docs.tailored_cv,
      check.company_name,
      docs.language,
    )
    const emailForRecruiterPdf = await renderRecruiterEmailPdf(
      docs.recruiter_message,
      docs.tailored_cv.full_name,
    )

    const zip = zipSync({
      'CV.pdf': cvPdf,
      'Cover Letter.pdf': coverLetterPdf,
      'Email for Recruiter.pdf': emailForRecruiterPdf,
    })

    const basePath = `${user.id}/${checkId}`

    await uploadFile(adminClient, `${basePath}/CV.pdf`, cvPdf, 'application/pdf')
    await uploadFile(adminClient, `${basePath}/Cover Letter.pdf`, coverLetterPdf, 'application/pdf')
    await uploadFile(
      adminClient,
      `${basePath}/Email for Recruiter.pdf`,
      emailForRecruiterPdf,
      'application/pdf',
    )
    await uploadFile(adminClient, `${basePath}/Documents.zip`, zip, 'application/zip')

    const [cvUrl, coverLetterUrl, emailForRecruiterUrl, zipUrl] = await Promise.all([
      signedUrl(adminClient, `${basePath}/CV.pdf`),
      signedUrl(adminClient, `${basePath}/Cover Letter.pdf`),
      signedUrl(adminClient, `${basePath}/Email for Recruiter.pdf`),
      signedUrl(adminClient, `${basePath}/Documents.zip`),
    ])

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
    text = new TextDecoder('utf-8').decode(arrayBuffer)
  } else {
    throw new Error('Unsupported file type')
  }

  const cleaned = text.replace(/\s+/g, ' ').trim()
  return cleaned.slice(0, MAX_CV_CHARS)
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
    detectedLanguage: string | null
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
    detectedLanguage: string | null
  },
): Promise<RawDocuments> {
  // Locked product rule: the job description is the sole authority on output
  // language, exactly as in analyze-check — no user override exists. When a
  // language was already determined for this check (the normal case), it is
  // passed through as a fixed instruction rather than redetected, so this
  // call can never land on a different language than the Feedback already
  // shown to the candidate.
  const languageInstruction = context.detectedLanguage
    ? `The language field must be exactly "${context.detectedLanguage}" — this was already determined from the job description in a prior analysis step. Do not redetect or override it.`
    : 'First, determine the language field: identify the PRIMARY language of the actual prose in the job description, based only on the literal words and grammar used in the text — ignore isolated foreign-language elements such as company names, software/tool/product names, technical terms, certification names, or short boilerplate sections in another language. Critically, never infer the language from geography: a job description written entirely in English is still English even if it mentions a company, office, city, or country where a different language is spoken — judge only the actual language the sentences are written in, never the location they describe. Only if the job description is genuinely too short or ambiguous to determine a primary language should you fall back to the language of the original CV; only if neither yields a clear answer, default to English. Output the language field as a lowercase ISO 639-1 two-letter code (e.g. "en", "nl", "de", "fr", "es"), covering any language, not just a fixed small list.'

  const systemPrompt = `You are an expert career writer helping a candidate present their strongest possible application for a specific role. Using their CV and the job description, produce three documents. Write as if the candidate is seeing their application the way a recruiter would, and use the recruiter's own assessment (strengths and areas to improve) to sharpen the framing — lean into the strengths, and address the improvement areas constructively without being defensive. Do not invent experience, employers, dates, or credentials that are not in the original CV.

${languageInstruction} Write all three documents entirely in that language, using natural, professional wording a native speaker would actually write in a real application in that language and culture, not a literal translation of the English structure described below (which shows structure and tone only, not fixed wording). This includes every section heading, transition word, greeting, and closing phrase — always substitute the natural equivalent a native speaker of that language would actually write for a job application, following that language's own professional correspondence conventions, not an English template translated word for word. Whatever language you determined, EVERY piece of prose you write below (professional_summary, experience bullets, cover letter paragraphs, recruiter message) must be entirely in that same language, with zero English sentences slipped in, even if that language is less common — do not default to English once you reach the writing itself. Never translate candidate names, company names, brand names, product names, tool names, or established technical/certification terminology where translating them would be misleading (e.g. "Microsoft PowerPoint", "Salesforce", "AWS" stay as is regardless of output language). Where the target language has a natural convention of writing certain compound words as one solid word rather than space separated (as Dutch and German do), follow that language's own correct spelling rather than forcing an English style separation.

Every document must be usable exactly as generated — the candidate should be able to submit this package to a real application with zero edits. Never write a bracketed or unfilled placeholder (e.g. "[Company Address]", "[Hiring Manager Name]", "[Recruiter's Name]") anywhere in any of the three documents. If a piece of information isn't available, omit it gracefully rather than leaving a placeholder for the candidate to fill in.

1. tailored_cv: a structured, tailored CV for this specific role.
   - full_name: extract exactly from the original CV.
   - contact_line: build this from only the details that actually appear in the original CV (city/country, email, phone, LinkedIn URL), joined with " • ". Never insert a generic label like "LinkedIn URL", "Phone Number", or "Email" as a stand in for a value that is not present. If only some of these details exist in the original CV, include only those and omit the rest entirely.
   - section_labels: the four standard resume section headings ("Professional Summary", "Work Experience", "Education", "Languages" in English), translated into natural, conventional resume headings in the target language — the words a native speaker actually uses on a real resume in that language, not a literal word for word translation.
   - professional_summary: required, never empty, and never more than exactly 3 sentences, written in third person without "I". This is entirely about the candidate, never the employer, so never mention the company name or reference "this role" or "this employer" anywhere in it. Follow an Evidence, Strength, Value framework: sentence 1 states concrete evidence of who the candidate is and their relevant experience (role, years, domain); sentence 2 names the core strength or pattern that evidence demonstrates; sentence 3 states the broader professional value or impact that strength delivers, described generically (e.g. "driving measurable revenue growth" or "building trusted client relationships"), not tied to any specific company. Keep each sentence short and direct.
   - experience: include up to 4 roles from the original CV, most relevant/recent first, favoring relevance to this job but leaning toward including more roles rather than fewer so the page fills out properly, the way a real one page resume does. If the candidate's original CV only has 2 or 3 roles total, include all of them (never invent a role that is not in the original CV) and instead add more depth: more bullets per entry (up to the 4 bullet limit) and more concrete detail drawn from the original CV, so the page still reads as full and substantive rather than sparse. Each entry needs a concise, tailored title, "company, location" (comma separated, not a dash), "dates" (preserve month and year exactly as given in the original CV when the original CV includes the month, e.g. "January 2023 to Present", written naturally in the target language, not just the year), and 3-4 short bullets rewritten to foreground what matters for this role.
   - Absolute rule, more important than filling space: every fact in every bullet, including every number, percentage, dollar amount, count, or timeframe, must be traceable to something actually stated in the original CV. When you add depth or an extra bullet to make an entry richer, that added material must be a rephrasing, reprioritization, or elaboration of details already in the original CV text, e.g. surfacing a scope word like "team of 4" or a tool name that was mentioned but not emphasized. It must never be a new number or outcome you composed to sound more impressive, even a plausible sounding one like "achieving a 25% conversion rate" that was never in the source. If the original CV genuinely has no more real detail to draw out for a bullet, keep that bullet as is rather than padding it with an invented figure.
   - Use the recruiter identified areas to improve provided below to actively guide how you rewrite the experience bullets, not just as background context: if an area to improve calls for more quantification, rework the relevant bullets to lead with whatever metrics, numbers, or concrete outcomes already exist in the original CV instead of burying them; if it calls for elaborating on a specific experience entry, give that entry more depth, more bullets (up to the 4 bullet limit), and more concrete detail than the others, drawing out relevant specifics from the original CV that were previously omitted or compressed. The goal is a fuller, richer looking entry for whichever role the feedback points to, not just a reworded one. Never invent a metric, outcome, or detail that is not actually present in the original CV — only re-prioritize, re-word, expand on, and bring forward what is already true.
   - education: only the most relevant 1-2 entries, with "dates" preserving month and year exactly as given in the original CV when the original CV includes the month.
   - languages: only include if present in the original CV, otherwise an empty array.
   - Do not include a skills list anywhere in the CV.
   - This CV must fit on a single printed page — be ruthlessly concise and omit anything not relevant to this job. Prioritize relevance over completeness.
2. cover_letter: a premium, professional cover letter for this role, written by the candidate, to the company, in the candidate's own voice. Write in clear, direct, plain language, no jargon and no filler, confident and positive throughout, exactly what a recruiter wants to read. This is the single most important rule for this document: write every sentence in the first person ("I", "my", "me"), exactly as the candidate would write it themselves. Never refer to the candidate by name or in the third person anywhere in intro_paragraph, body_paragraphs, or conclusion_paragraph (wrong: "Maya is excited to apply... She has..."; right: "I am excited to apply... I have..."). Structured as:
   - company_location: read the entire job description carefully, including the very start and end and any line near the job title or company name, for any statement of the company's location, such as "based in Berlin", "our Amsterdam office", "Remote, Netherlands", a city name next to the job title, or a full address line. If a location is found, extract it: format as "City, Country" when both are given, or just the city (or just the country) when only one is given. Only use an empty string if the job description truly contains no location information anywhere, after a careful full read. Do not invent a location that is not actually stated in the job description.
   - salutation: the natural formal greeting for a cover letter in the target language, addressed to the company's hiring team. The company name provided below (see "Company:" in the context) may be empty if it could not be determined from the job description — when it is empty, use a generic greeting to the hiring team with no company name in it (e.g. "Dear Hiring Team," in English); when a company name is provided, substitute it in naturally. Never write a bracketed placeholder like "Dear <Company> Hiring Team," and never invent a company name that was not provided.
   - intro_paragraph: first person opening stating who I am and the role I'm applying for — a strong, direct hook.
   - body_paragraphs: exactly 3 short first person paragraphs, always in this order:
     1. Specific fit for this job's requirements, drawing on one real piece of experience and a concrete result or outcome from the CV.
     2. A second, different piece of specific fit evidence: another real skill, experience, or quantifiable result from the CV relevant to this job's requirements. Do not repeat the first paragraph's example. Start this paragraph with a natural transition word or phrase in the target language.
     3. Soft skills and working style, written as genuine, confident personal qualities relevant to being a good hire, for example collaborating well in a team while also working independently, strong time management with a habit of delivering ahead of schedule, and enthusiasm for contributing to team or company culture. Keep this authentic and specific, not generic corporate language. Start this paragraph with a natural transition word or phrase in the target language.
   - conclusion_paragraph: a short, confident closing paragraph with a clear call to action, expressing enthusiasm to discuss the role further. Do not include a final thank you sentence here — that goes in thank_you_line below.
   - thank_you_line: a single, natural sentence in the target language thanking them for considering the application (e.g. "Thank you for considering my application." in English) — kept separate from conclusion_paragraph so it always renders as its own closing line.
   - closing_phrase: the natural formal sign off used to close a letter in the target language (e.g. "Yours sincerely," in English) — the candidate's name is added separately as the signature on the next line, so do not include it here.
   - The letter has no header block (no name, contact details, or address at the top) — it begins directly with the date. Do not include a return address or salutation-block contact info.
   - The whole letter (intro + exactly 3 body paragraphs + conclusion + thank_you_line) must always fit on a single printed page, no exceptions — be concise in every paragraph.
3. recruiter_message: a short outreach message from the candidate to a recruiter or hiring manager for this role (e.g. via LinkedIn or email), written entirely in the first person ("I"), never referring to the candidate by name or in the third person, split into these separate fields:
   - greeting: a short greeting in the target language, on its own (e.g. "Hi," in English) — never a bracketed placeholder like "[Recruiter's Name]", since the recruiter's actual name isn't known.
   - body: exactly 3 short sentences as one block of text, in this order:
     a. State I have applied for this specific role.
     b. Convey genuine high interest, passion, and positivity for the role and company, tied to a real detail from the job description (not generic enthusiasm).
     c. Give exactly one specific, tangible reason I am the right fit, pulled fresh from the original CV and job description. Describe this in qualitative, text only terms, such as a concrete skill combination, relevant domain experience, or a genuine alignment with the company's mission or values. Never cite a number, percentage, or other statistic here, even if the CV has one (numbers belong in the CV itself, not this message). This sentence must be a fresh angle, not a restatement or paraphrase of anything in the recruiter identified strengths provided below — the goal is to make the recruiter want to open the attached CV, not repeat feedback they already have.
   - closing_line: a brief, warm closing sentence in the target language looking forward to hearing back (e.g. "I look forward to hearing from you." in English).
   - sign_off: the natural formal sign off used to close a short message in the target language (e.g. "Kind regards," in English) — the candidate's name is added separately as the signature on the next line, so do not include it here.

Never use hyphens, en dashes, or em dashes anywhere in any of the three documents (no "-", "–", or "—"). This is an absolute rule with no exceptions. This includes dates ("2020-2023"), job titles, and compound words and phrases that would default to a hyphen in English (such as "well-known", "data-driven", "problem-solving", "self-motivated", "detail-oriented", "cross-functional", "well-being", "ad-hoc", "up-to-date") — always write these as two separate words instead (e.g. "well known", "data driven", "problem solving"), and use a comma or the target language's natural word for "to" in date ranges (e.g. "2020 to 2023" in English). In languages, like Dutch and German, where compound words are conventionally written as a single solid word, use that correct solid spelling instead of an English style hyphenated or space separated version. Before finalizing your answer, reread every sentence you wrote and remove any hyphen, en dash, or em dash you find.

Finally, self check your own output and populate new_claims_introduced: a JSON array of every number, percentage, currency amount, count, timeframe, employer name, job title, certification, or skill that appears anywhere in the tailored_cv, cover_letter, or recruiter_message above but is not a direct restatement, reordering, or rephrasing of something that actually appears in the original CV text provided below. This is an honest self audit, not a formality — go back through every bullet, every sentence, and every figure you wrote and verify it against the original CV. If you are not certain a specific detail traces back to the original CV, include it here rather than omitting it. Return an empty array only if, after this careful check, truly nothing you wrote goes beyond what the original CV actually states.`

  const userPrompt = `Job title: ${context.jobTitle ?? 'Not specified'}
Company: ${context.companyName ?? 'Not specified'}

Job description:
${jobDescription}

Recruiter identified strengths:
${context.strengths.map((item) => `- ${item}`).join('\n')}

Recruiter identified areas to improve:
${context.improvements.map((item) => `- ${item}`).join('\n')}

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
              language: {
                type: 'string',
                description: 'Lowercase ISO 639-1 two-letter language code these documents are written in, e.g. en, nl, de, fr, es.',
              },
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
                        bullets: { type: 'array', items: { type: 'string' } },
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
            },
            required: [
              'language',
              'tailored_cv',
              'cover_letter',
              'recruiter_message',
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
    throw new Error('Empty response from document generation service')
  }

  return JSON.parse(rawText) as RawDocuments
}

// Defensive caps on top of the prompt's own instructions, so the shrink-to-fit
// pass in renderCvPdf/renderCoverLetterPdf can reliably keep each to a single page.
const MAX_EXPERIENCE_ENTRIES = 4
const MAX_BULLETS_PER_ENTRY = 4
const MAX_EDUCATION_ENTRIES = 2
const REQUIRED_BODY_PARAGRAPHS = 3

const LANGUAGE_CODE_RE = /^[a-z]{2}$/

const ENGLISH_TELLS = [' the ', ' and ', ' your ', ' that ', ' with ', ' this ', ' for ', ' you ', ' are ', ' have ']

function looksLikeEnglish(text: string): boolean {
  const padded = ` ${text.toLowerCase()} `
  return ENGLISH_TELLS.filter((tell) => padded.includes(tell)).length >= 5
}

function validateDocuments(raw: RawDocuments): RawDocuments {
  const cv = raw.tailored_cv
  const letter = raw.cover_letter
  const message = raw.recruiter_message

  // The model self-reports any fact it introduced beyond the original CV
  // (new_claims_introduced, required by the schema). Rather than trusting the
  // "never invent a metric" prompt instructions alone, a non-empty report is
  // treated as a failed generation and retried — see generateDocuments' loop.
  const newClaims = Array.isArray(raw.new_claims_introduced)
    ? raw.new_claims_introduced.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
  if (newClaims.length > 0) {
    throw new Error(`Model reported unverified claims not present in the original CV: ${JSON.stringify(newClaims)}`)
  }

  // Detection should never block a result — if the model returns something
  // that isn't a plausible ISO 639-1 code, fall back to English rather than
  // let an invalid value propagate into the rendering paths below.
  const docLanguage = LANGUAGE_CODE_RE.test(raw.language ?? '') ? raw.language : 'en'

  const sectionLabels: SectionLabels = {
    summary: (cv?.section_labels?.summary ?? '').trim() || 'Professional Summary',
    experience: (cv?.section_labels?.experience ?? '').trim() || 'Work Experience',
    education: (cv?.section_labels?.education ?? '').trim() || 'Education',
    languages: (cv?.section_labels?.languages ?? '').trim() || 'Languages',
  }

  const greeting = stripDashes((message?.greeting ?? '').trim(), docLanguage)
  const messageBody = stripDashes((message?.body ?? '').trim(), docLanguage)
  const closingLine = stripDashes((message?.closing_line ?? '').trim(), docLanguage)
  const signOff = (message?.sign_off ?? '').trim() || 'Kind regards,'

  const fullName = (cv?.full_name ?? '').trim()
  const contactLine = (cv?.contact_line ?? '').trim()
  // Cap at 3 sentences regardless of what the model returns (the prompt asks
  // for exactly 3 via the Evidence, Strength, Employer Value framework, but
  // this guarantees it deterministically rather than trusting compliance).
  const professionalSummary = splitSentences(
    stripDashes((cv?.professional_summary ?? '').trim(), docLanguage),
  )
    .slice(0, 3)
    .join(' ')
  const experience = Array.isArray(cv?.experience) ? cv.experience : []
  const education = Array.isArray(cv?.education) ? cv.education : []

  const introParagraph = stripDashes((letter?.intro_paragraph ?? '').trim(), docLanguage)
  const conclusionParagraph = stripDashes((letter?.conclusion_paragraph ?? '').trim(), docLanguage)
  const thankYouLine = stripDashes((letter?.thank_you_line ?? '').trim(), docLanguage)
  const bodyParagraphs = (Array.isArray(letter?.body_paragraphs) ? letter.body_paragraphs : [])
    .map((paragraph) => stripDashes(paragraph.trim(), docLanguage))
    .filter(Boolean)
  const salutation = (letter?.salutation ?? '').trim()
  const closingPhrase = (letter?.closing_phrase ?? '').trim() || 'Yours sincerely,'

  if (!fullName) throw new Error('Tailored CV is missing a name')
  if (!professionalSummary) throw new Error('Tailored CV is missing a professional summary')
  if (experience.length === 0) throw new Error('Tailored CV is missing experience')
  if (!salutation) throw new Error('Cover letter is missing a salutation')
  if (!introParagraph) throw new Error('Cover letter is missing an introduction')
  if (bodyParagraphs.length !== REQUIRED_BODY_PARAGRAPHS) {
    throw new Error('Cover letter must have exactly 3 body paragraphs')
  }
  if (!conclusionParagraph) throw new Error('Cover letter is missing a conclusion')
  if (!thankYouLine) throw new Error('Cover letter is missing a thank you line')
  if (!greeting) throw new Error('Recruiter message is missing a greeting')
  if (messageBody.length < 20) throw new Error('Recruiter message output is too short')
  if (!closingLine) throw new Error('Recruiter message is missing a closing line')

  // The letter must be written in the candidate's own first-person voice, not
  // a third-person recommendation about them — reject and retry if the model
  // slipped into naming the candidate anywhere in the letter body.
  const letterBody = `${introParagraph} ${bodyParagraphs.join(' ')} ${conclusionParagraph}`
  if (containsName(letterBody, fullName)) {
    throw new Error('Cover letter is written in third person instead of first person')
  }
  if (containsName(messageBody, fullName)) {
    throw new Error('Recruiter message is written in third person instead of first person')
  }

  // The recruiter message must stay qualitative, not cite statistics (the
  // prompt asks for this, but the model can still slip in a number).
  if (/\d/.test(messageBody)) {
    throw new Error('Recruiter message contains a statistic instead of a qualitative reason')
  }

  // Live testing found the model can correctly set language: "de" while
  // still writing the actual prose in English — nothing structural catches
  // that, so this checks for English leakage specifically (not a positive
  // check for any one target language, which wouldn't generalize).
  if (
    docLanguage !== 'en' &&
    looksLikeEnglish([professionalSummary, introParagraph, ...bodyParagraphs, conclusionParagraph, messageBody].join(' '))
  ) {
    throw new Error(`Document content language did not match detected language "${docLanguage}"`)
  }

  return {
    language: docLanguage,
    tailored_cv: {
      full_name: fullName,
      contact_line: contactLine,
      section_labels: sectionLabels,
      professional_summary: professionalSummary,
      experience: experience.slice(0, MAX_EXPERIENCE_ENTRIES).map((entry) => ({
        title: stripDashes((entry.title ?? '').trim(), docLanguage),
        company_location: (entry.company_location ?? '').trim(),
        dates: (entry.dates ?? '').trim(),
        bullets: (Array.isArray(entry.bullets) ? entry.bullets : [])
          .map((bullet) => stripDashes(bullet.trim(), docLanguage))
          .filter(Boolean)
          .slice(0, MAX_BULLETS_PER_ENTRY),
      })),
      education: education.slice(0, MAX_EDUCATION_ENTRIES).map((entry) => ({
        degree: (entry.degree ?? '').trim(),
        institution: (entry.institution ?? '').trim(),
        dates: (entry.dates ?? '').trim(),
      })),
      languages: (Array.isArray(cv.languages) ? cv.languages : [])
        .map((language) => language.trim())
        .filter(Boolean),
    },
    cover_letter: {
      company_location: (letter?.company_location ?? '').trim(),
      salutation,
      intro_paragraph: introParagraph,
      body_paragraphs: bodyParagraphs,
      conclusion_paragraph: conclusionParagraph,
      thank_you_line: thankYouLine,
      closing_phrase: closingPhrase,
    },
    recruiter_message: {
      greeting,
      body: messageBody,
      closing_line: closingLine,
      sign_off: signOff,
    },
  }
}

/**
 * Splits text into sentences on ., !, or ?. Decimal points inside numbers
 * (e.g. "7.2%") are protected first so a stat like that never gets split
 * into two fragments ("7." and "2%") — a real bug this app hit, since CVs
 * routinely cite decimal metrics and the naive split would corrupt them.
 */
function splitSentences(text: string): string[] {
  const DECIMAL_MARK = '@@DECIMAL@@'
  const protectedText = text.replace(/(\d)\.(\d)/g, `$1${DECIMAL_MARK}$2`)
  return (protectedText.match(/[^.!?]+[.!?]+(\s+|$)/g) ?? [protectedText])
    .map((sentence) => sentence.trim().split(DECIMAL_MARK).join('.'))
    .filter(Boolean)
}

/**
 * Checks whether any name part (first, last, etc, each 3+ letters to avoid
 * false positives on short/common words) from fullName appears as a whole
 * word inside text — a signal the letter was written about the candidate in
 * the third person instead of in their own first-person voice.
 */
function containsName(text: string, fullName: string): boolean {
  const nameParts = fullName.split(/\s+/).filter((part) => part.length >= 3)
  return nameParts.some((part) => {
    const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
  })
}

/**
 * Removes every hyphen, en dash, and em dash from model-composed prose — a
 * hard rule for this app. The prompt already asks for this, but the model
 * still slips on common compounds (e.g. "problem-solving"), so this sanitizes
 * the text deterministically instead of relying on reject-and-retry, which
 * could otherwise fail the whole generation if the model keeps repeating it.
 */
function stripDashes(text: string, language = 'en'): string {
  // "to" is a reasonable universal fallback for this rare backstop path (the
  // model is instructed to avoid hyphenated date ranges entirely in the
  // target language already) — "tot" is kept as a small, harmless accommodation
  // for Dutch specifically, not a restriction on which languages are supported.
  const rangeConnector = language === 'nl' ? 'tot' : 'to'
  return text
    // Date ranges like "2020-2023" or "2020 - 2023" -> "2020 to 2023" (or
    // "2020 tot 2023" in Dutch).
    .replace(/\b(\d{4})\s*[-–—]\s*(\d{4})\b/g, `$1 ${rangeConnector} $2`)
    // Compound words: a dash directly between two word characters -> space
    // (e.g. "ad-hoc" -> "ad hoc", "self-motivated" -> "self motivated").
    .replace(/(\w)[-–—](?=\w)/g, '$1 ')
    // Any remaining dash (used as a clause separator) -> comma.
    .replace(/\s*[-–—]\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/ ,/g, ',')
    .trim()
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
  fonts: { regular: PDFFont; bold: PDFFont },
  pageWidth: number,
  margin: number,
  scale: number,
): { lines: DrawLine[]; totalHeight: number } {
  // Section headings come from the model itself (translated into the
  // detected language as part of the same structured response), rather than
  // a hardcoded lookup table — this is what lets the CV render correctly in
  // any language the model supports, not just a fixed small list.
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
      entry.bullets.forEach((bullet) => addBullet(bullet, bodySize, fonts.regular, BLACK))
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

async function renderCvPdf(cv: TailoredCv): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const pageWidth = 612
  const pageHeight = 792
  const margin = 48
  const usableHeight = pageHeight - margin * 2

  const scales = [1, 0.92, 0.85, 0.78, 0.72, 0.66]
  let chosen = layoutCv(cv, { regular, bold }, pageWidth, margin, scales[scales.length - 1])

  for (const scale of scales) {
    const attempt = layoutCv(cv, { regular, bold }, pageWidth, margin, scale)
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

  return pdfDoc.save()
}

function formatLetterDate(language = 'en'): string {
  // Intl.DateTimeFormat accepts a bare ISO 639-1 language tag directly (it
  // picks a sensible default region) — no need for a hardcoded per-language
  // locale table, which is what let this only ever support English/Dutch.
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', year: 'numeric' }).format(
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
  language: string,
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
  addRight(formatLetterDate(language), metaSize, fonts.regular, BLACK, hasCompanyBlock ? gapHeader : gapMedium, false)

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

  // thank_you_line is its own field from the model (in the target language),
  // not parsed out of conclusion_paragraph via a language-specific regex —
  // it always renders as its own closing line.
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
  language: string,
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
    language,
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
      language,
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
        language,
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
        language,
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
 * heading inside the document. Every piece of text (greeting, body, closing
 * line, sign off) is its own field from the model already in the target
 * language — nothing here is parsed out of a single string via a
 * language-specific pattern, so this works for any language the model
 * supports, not just English/Dutch.
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
