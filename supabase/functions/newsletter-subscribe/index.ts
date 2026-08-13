import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CONSENT_TEXT = 'Send me The Recruiter Check newsletter and related career advice. I can unsubscribe at any time.'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    const body = await req.json()
    if (typeof body?.website === 'string' && body.website.trim()) {
      return jsonResponse({ subscribed: true })
    }

    const email = normalizeEmail(body?.email)
    const consent = body?.consent === true
    const source = normalizeSource(body?.source)

    if (!email) return jsonResponse({ error: 'Enter a valid email address.' }, 400)
    if (!consent) return jsonResponse({ error: 'Confirm that you want to receive the newsletter.' }, 400)

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { error } = await adminClient
      .from('newsletter_subscribers')
      .upsert({
        email,
        status: 'active',
        consent_source: source,
        consent_text: CONSENT_TEXT,
        consent_at: new Date().toISOString(),
        unsubscribed_at: null,
      }, { onConflict: 'email' })

    if (error) {
      console.error('newsletter-subscribe: storage failed', { code: error.code })
      return jsonResponse({ error: 'We could not save your subscription. Try again.' }, 500)
    }

    return jsonResponse({ subscribed: true })
  } catch {
    return jsonResponse({ error: 'We could not save your subscription. Try again.' }, 500)
  }
})

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

function normalizeSource(value: unknown): string {
  if (typeof value !== 'string') return 'public_site'
  return value.replace(/[^a-z0-9_]/gi, '').slice(0, 80) || 'public_site'
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

