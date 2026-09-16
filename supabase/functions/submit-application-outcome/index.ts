import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { parseRequest } from './logic.ts'

// Public endpoint behind the /outcome page, reached from the follow up email
// with no login (verify_jwt = false in supabase/config.toml). The link token
// is the only credential, exactly as with newsletter-unsubscribe: it is a
// random uuid stored on one application_outcomes row, and every action here
// is scoped to that single row.
//
// Actions:
//   lookup    whether the link is valid, answered or withdrawn. Returns no
//             personal data, so a leaked link reveals nothing about the check.
//   answer    records the answers. Refused once consent is withdrawn.
//   withdraw  "stop asking me": sets withdrawn_at. Idempotent.
//
// Responses are deliberately generic, and nothing here logs the token or the
// answers.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid request.' }, 400)
  }

  const parsed = parseRequest(body)
  if (!parsed.ok) return jsonResponse({ error: parsed.error }, 400)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const { data: row, error: readError } = await db
      .from('application_outcomes')
      .select('id, withdrawn_at, responded_at')
      .eq('followup_token', parsed.token)
      .maybeSingle()

    if (readError) return jsonResponse({ error: 'We could not open this link. Try again later.' }, 500)
    if (!row) return jsonResponse({ error: 'This link is not valid.' }, 404)

    const now = new Date().toISOString()

    if (parsed.action === 'lookup') {
      return jsonResponse({ withdrawn: Boolean(row.withdrawn_at), answered: Boolean(row.responded_at) })
    }

    if (parsed.action === 'withdraw') {
      if (!row.withdrawn_at) {
        const { error } = await db
          .from('application_outcomes')
          .update({ withdrawn_at: now, updated_at: now })
          .eq('id', row.id)
        if (error) return jsonResponse({ error: 'We could not update your preference. Try again later.' }, 500)
      }
      return jsonResponse({ withdrawn: true })
    }

    if (row.withdrawn_at) {
      return jsonResponse({ error: 'You asked us to stop, so this answer was not saved.' }, 409)
    }

    const { error } = await db
      .from('application_outcomes')
      .update({ ...parsed.answer, responded_at: now, updated_at: now })
      .eq('id', row.id)
    if (error) return jsonResponse({ error: 'We could not save your answer. Try again later.' }, 500)

    return jsonResponse({ saved: true })
  } catch {
    return jsonResponse({ error: 'We could not save your answer. Try again later.' }, 500)
  }
})

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
