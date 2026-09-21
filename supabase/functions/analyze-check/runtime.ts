// The Deno-only half of analyze-check that other functions reuse:
// CV text extraction and the OpenAI call with its one validated retry.
// Split out of index.ts unchanged so assess-evidence-follow-up runs the very
// same parsing, prompt, schema, retry and validation path as the initial
// analysis, instead of a copy that could drift. index.ts holds the request
// handling; nothing about behaviour changed in the move.

import { Buffer } from 'node:buffer'
import mammoth from 'npm:mammoth@1.8.0'
import { extractText as extractPdfText, getDocumentProxy } from 'npm:unpdf@0.12.1'
import { normalizeAnalysis, withRetry, type AnalysisResult, type RawAnalysis } from './logic.ts'
import { buildAnalysisRequestBody, type AnalysisContext } from './prompt.ts'

const MAX_CV_CHARS = 15000
// Exactly two attempts total: validate the first AI response, retry once if
// it's invalid, and fail safely (no saved score, no consumed credit) if the
// second attempt is also invalid. Never silently falls back to a fabricated
// result.
const MAX_ATTEMPTS = 2
const OPENAI_TIMEOUT_MS = 45000
const PARSE_TIMEOUT_MS = 15000

// One rate limit for every analysis call. assess-evidence-follow-up imports
// these rather than repeating them, so a follow up reassessment draws from
// exactly the bucket, limit and window an initial analysis does and the two
// can never drift into separate allowances.
export const RATE_LIMIT_BUCKET = 'analyze-check'
export const RATE_LIMIT_MAX = 10
export const RATE_LIMIT_WINDOW_SECONDS = 3600

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

export async function extractText(file: Blob, fileName: string): Promise<string> {
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

// Aggregate, non-sensitive token usage as returned by OpenAI's own response
// — never derived from, or containing, any prompt/CV/job-description text.
export interface TokenUsage {
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
}

export interface GenerateFeedbackMetrics {
  attempts: number
  firstAttemptSuccess: boolean
  retryUsed: boolean
  totalDurationMs: number
  firstAttemptDurationMs: number | null
  retryDurationMs: number | null
  model: string | null
  usage: TokenUsage | null
}

/**
 * Structured JSON output, schema-validated. Validates the first AI response;
 * if it's invalid (fails schema/grounding/consistency checks inside
 * normalizeAnalysis) or the call itself fails, retries exactly once more.
 * If the second attempt is also invalid, throws rather than returning
 * anything — there is no fallback result. The caller (below) treats that
 * throw as a hard failure: mark the check 'failed', save no feedback,
 * complete no score, consume no credit. withRetry lives in logic.ts so the
 * retry mechanism itself is unit-testable without a Deno runtime.
 *
 * Also returns aggregate, privacy safe timing/model/token metrics for
 * monitoring (see logMonitoringEvent) — populated on success only; the
 * caller's catch block builds its own metrics for the failure case, since
 * this function throws (not returns) when every attempt fails.
 */
export async function generateFeedback(
  apiKey: string,
  cvText: string,
  jobDescription: string,
  context: AnalysisContext,
): Promise<{ analysis: AnalysisResult; metrics: GenerateFeedbackMetrics }> {
  const startedAt = Date.now()
  let attempts = 0
  let firstAttemptDurationMs: number | null = null
  let retryDurationMs: number | null = null
  let lastModel: string | null = null
  let lastUsage: TokenUsage | null = null

  const analysis = await withRetry(async (previousError) => {
    attempts += 1
    const attemptStartedAt = Date.now()
    const { raw, model, usage } = await callOpenAI(apiKey, cvText, jobDescription, context, previousError)
    lastModel = model
    lastUsage = usage
    const result = normalizeAnalysis(raw, cvText, { model })
    const attemptDurationMs = Date.now() - attemptStartedAt
    if (attempts === 1) firstAttemptDurationMs = attemptDurationMs
    else retryDurationMs = attemptDurationMs
    return result
  }, MAX_ATTEMPTS)

  return {
    analysis,
    metrics: {
      attempts,
      firstAttemptSuccess: attempts === 1,
      retryUsed: attempts > 1,
      totalDurationMs: Date.now() - startedAt,
      firstAttemptDurationMs,
      retryDurationMs,
      model: lastModel,
      usage: lastUsage,
    },
  }
}

async function callOpenAI(
  apiKey: string,
  cvText: string,
  jobDescription: string,
  context: AnalysisContext,
  // Set only on a retry: the previous attempt's validation failure message
  // (from normalizeAnalysis, or "Empty response"/a parse error from this
  // function itself), appended as a correction instruction below. This is
  // never logged by our own code — see the catch block in the main handler
  // — it only ever travels back to the same model that already produced
  // whatever text it might reference, so nothing new is exposed by sending
  // it back in the request.
  correctionNote: string | null = null,
): Promise<{ raw: RawAnalysis; model: string | null; usage: TokenUsage | null }> {
  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    // The prompt, schema, model and temperature all live in prompt.ts and
    // are shared verbatim with scripts/live-sample-wording.ts.
    body: JSON.stringify(buildAnalysisRequestBody(cvText, jobDescription, context, correctionNote)),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenAI API error: ${response.status} ${body}`)
  }

  const payload = (await response.json()) as {
    model?: string
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  }
  const rawText = payload.choices?.[0]?.message?.content

  if (!rawText) {
    throw new Error('Empty response from analysis service')
  }

  // Aggregate token counts only — never the prompt or completion text
  // itself. Absent entirely from providers/responses that don't return it.
  const usage: TokenUsage | null = payload.usage
    ? {
        promptTokens: payload.usage.prompt_tokens ?? null,
        completionTokens: payload.usage.completion_tokens ?? null,
        totalTokens: payload.usage.total_tokens ?? null,
      }
    : null

  // The response's own `model` field is the resolved model snapshot (e.g.
  // "gpt-4o-mini-2024-07-18"), not just the alias requested — this is what
  // gets stamped into the score breakdown as the model identifier, when
  // OpenAI's response actually includes it.
  return { raw: JSON.parse(rawText) as RawAnalysis, model: payload.model ?? null, usage }
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

