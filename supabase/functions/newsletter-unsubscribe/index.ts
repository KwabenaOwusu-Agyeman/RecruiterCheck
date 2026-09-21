import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { removeBrevoContactFromList } from '../_shared/email/brevoContacts.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    const body = await req.json()
    const token = typeof body?.token === 'string' ? body.token.trim() : ''
    if (!/^[0-9a-f-]{36}$/i.test(token)) return jsonResponse({ error: 'Invalid unsubscribe link.' }, 400)

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: rows, error } = await adminClient
      .from('newsletter_subscribers')
      .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
      .eq('unsubscribe_token', token)
      .select('email')

    if (error) return jsonResponse({ error: 'We could not update your subscription.' }, 500)

    // The weekly issue is a Brevo campaign sent to the newsletter list, so the
    // row above alone never stopped it. Brevo failing does not undo the
    // unsubscribe: the row is the consent record, and the failure is logged
    // so the contact can be removed by hand.
    const email = rows?.[0]?.email as string | undefined
    const listId = Number(Deno.env.get('BREVO_NEWSLETTER_LIST_ID') ?? '0')
    if (email && listId > 0) {
      const removal = await removeBrevoContactFromList(email, listId)
      if (!removal.added) {
        console.error('newsletter-unsubscribe: Brevo list removal failed', { reason: removal.reason })
      }
    }

    return jsonResponse({ unsubscribed: true })
  } catch {
    return jsonResponse({ error: 'We could not update your subscription.' }, 500)
  }
})

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

