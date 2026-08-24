import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { Buffer } from 'node:buffer'
import mammoth from 'npm:mammoth@1.8.0'
import { extractText as extractPdfText, getDocumentProxy } from 'npm:unpdf@0.12.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
const MAX_EXTRACTED_CHARS = 15000
const MIN_EXTRACTED_CHARS = 50
const PARSE_TIMEOUT_MS = 15000
const COULD_NOT_READ_MESSAGE = 'Could not read this file. Paste the job description instead.'

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

    const formData = await req.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return jsonResponse({ error: 'file is required' }, 400)
    }

    // Server-side validation — never rely on the client's <input accept>
    // attribute alone.
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return jsonResponse({ error: 'Please upload a PDF, Word (.docx), or plain text file.' }, 400)
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return jsonResponse({ error: 'File must be 10 MB or smaller.' }, 400)
    }

    let text: string
    try {
      text = await extractText(file, file.type)
    } catch (error) {
      console.error('extract-job-file: parsing failed', {
        fileName: file.name,
        fileType: file.type,
        message: error instanceof Error ? error.message : String(error),
      })
      return jsonResponse({ error: COULD_NOT_READ_MESSAGE }, 422)
    }

    if (text.length < MIN_EXTRACTED_CHARS) {
      console.error('extract-job-file: extracted text too short', { length: text.length })
      return jsonResponse({ error: COULD_NOT_READ_MESSAGE }, 422)
    }

    return jsonResponse({ jobDescription: text })
  } catch (error) {
    console.error('extract-job-file error:', error)
    return jsonResponse({ error: COULD_NOT_READ_MESSAGE }, 500)
  }
})

/**
 * Checks the file's actual leading bytes against its declared MIME type
 * rather than trusting the browser-reported Content-Type alone — a renamed
 * or relabeled file (e.g. an arbitrary binary uploaded with a spoofed
 * application/pdf type) would otherwise reach the PDF/DOCX parser
 * unvalidated. text/plain has no reliable signature, so it's skipped.
 */
function hasValidMagicBytes(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'application/pdf') {
    // "%PDF-"
    return (
      bytes.length >= 5 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46 &&
      bytes[4] === 0x2d
    )
  }
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    // DOCX is a zip archive: local file header "PK\x03\x04"
    return (
      bytes.length >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x03 &&
      bytes[3] === 0x04
    )
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

async function extractText(file: File, mimeType: string): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)

  if (!hasValidMagicBytes(bytes, mimeType)) {
    throw new Error('File content does not match its declared type')
  }

  let text: string

  if (mimeType === 'application/pdf') {
    const pdf = await withTimeout(getDocumentProxy(bytes), PARSE_TIMEOUT_MS, 'PDF parsing')
    const result = await withTimeout(extractPdfText(pdf, { mergePages: true }), PARSE_TIMEOUT_MS, 'PDF text extraction')
    text = Array.isArray(result.text) ? result.text.join('\n') : result.text
  } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await withTimeout(
      mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) }),
      PARSE_TIMEOUT_MS,
      'DOCX parsing',
    )
    text = result.value
  } else {
    text = new TextDecoder('utf-8').decode(arrayBuffer)
  }

  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length < MIN_EXTRACTED_CHARS) {
    throw new Error('Extracted text is too short')
  }

  return cleaned.slice(0, MAX_EXTRACTED_CHARS)
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
