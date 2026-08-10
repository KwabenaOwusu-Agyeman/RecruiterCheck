import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { Buffer } from 'node:buffer'
import mammoth from 'npm:mammoth@1.8.0'
import { extractText as extractPdfText, getDocumentProxy } from 'npm:unpdf@0.12.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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

async function extractText(file: File, mimeType: string): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()

  let text: string

  if (mimeType === 'application/pdf') {
    const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer))
    const result = await extractPdfText(pdf, { mergePages: true })
    text = Array.isArray(result.text) ? result.text.join('\n') : result.text
  } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) })
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
