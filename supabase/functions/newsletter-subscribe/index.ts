import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { buildNewsletterWelcomeEmail } from '../_shared/email/templates.ts'
import { sendTransactionalEmail } from '../_shared/email/brevoClient.ts'
import { upsertBrevoContact } from '../_shared/email/brevoContacts.ts'

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

    // This row is the durable consent record: the exact wording agreed to,
    // when, and from which page. Brevo holds the sending list, but the
    // evidence of consent stays in our own database.
    const { data: subscriber, error } = await adminClient
      .from('newsletter_subscribers')
      .upsert({
        email,
        status: 'active',
        consent_source: source,
        consent_text: CONSENT_TEXT,
        consent_at: new Date().toISOString(),
        unsubscribed_at: null,
      }, { onConflict: 'email' })
      .select('unsubscribe_token')
      .maybeSingle()

    if (error) {
      console.error('newsletter-subscribe: storage failed', { code: error.code })
      return jsonResponse({ error: 'We could not save your subscription. Try again.' }, 500)
    }

    // Brevo owns the sending list, so campaigns and its own unsubscribe
    // handling work without an export step. Deliberately not fatal: if Brevo
    // is unreachable the consent record above still stands and the contact
    // can be reconciled later.
    const listId = Number(Deno.env.get('BREVO_NEWSLETTER_LIST_ID') ?? '0')
    if (listId > 0) {
      const contact = await upsertBrevoContact(email, listId)
      if (!contact.added) {
        console.error('newsletter-subscribe: Brevo contact failed', { reason: contact.reason })
      }
    } else {
      console.warn('newsletter-subscribe: BREVO_NEWSLETTER_LIST_ID not set, skipping Brevo contact')
    }

    await sendWelcomeEmail(email, subscriber?.unsubscribe_token ?? null)

    return jsonResponse({ subscribed: true })
  } catch {
    return jsonResponse({ error: 'We could not save your subscription. Try again.' }, 500)
  }
})

/**
 * Sends via Brevo, using the same client and shell as every other
 * MyRecruiterCheck email.
 *
 * The previous implementation posted hand-rolled HTML to a different provider
 * and, because its from-address secret was never set, fell back to a shared
 * sandbox domain with no authentication against myrecruitercheck.com.
 *
 * Failures are swallowed: the subscription is already saved by the time this
 * runs, and a missing welcome email must never fail the signup.
 */
async function sendWelcomeEmail(email: string, unsubscribeToken: string | null) {
  const siteUrl = Deno.env.get('SITE_URL') ?? 'https://myrecruitercheck.com'
  const unsubscribeUrl = unsubscribeToken
    ? `${siteUrl}/newsletter/unsubscribe?token=${unsubscribeToken}`
    : `${siteUrl}/newsletter/unsubscribe`

  const built = buildNewsletterWelcomeEmail(`${siteUrl}/checks/new`, unsubscribeUrl)

  const result = await sendTransactionalEmail({
    toEmail: email,
    subject: built.subject,
    htmlContent: built.html,
    textContent: built.text,
  })

  if (!result.sent) {
    console.error('newsletter-subscribe: welcome email failed', { reason: result.reason })
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

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
