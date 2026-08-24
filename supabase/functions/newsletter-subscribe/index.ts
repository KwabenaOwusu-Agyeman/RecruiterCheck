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

    await sendWelcomeEmail(email)

    return jsonResponse({ subscribed: true })
  } catch {
    return jsonResponse({ error: 'We could not save your subscription. Try again.' }, 500)
  }
})

async function sendWelcomeEmail(email: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    console.warn('newsletter-subscribe: RESEND_API_KEY not set, skipping welcome email')
    return
  }

  const from = Deno.env.get('RESEND_FROM_EMAIL') ?? 'MyRecruiterCheck <onboarding@resend.dev>'

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: 'You are on the list',
        html: welcomeEmailHtml(),
      }),
    })

    if (!response.ok) {
      console.error('newsletter-subscribe: welcome email failed', { status: response.status })
    }
  } catch (sendError) {
    console.error('newsletter-subscribe: welcome email error', { message: String(sendError) })
  }
}

function welcomeEmailHtml(): string {
  const navy = '#020C38'
  const blue = '#194A9F'
  const textSecondary = '#3A4A6B'
  const border = '#EEF0F5'
  const success = '#0EA063'
  const warning = '#F59E0B'

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <title>You are on the list</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff;">
          <tr>
            <td align="center" style="padding: 40px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px;">

                <tr>
                  <td style="padding-bottom: 32px;">
                    <span style="font-size: 16px; font-weight: 700; color: ${navy};">MyRecruiterCheck</span>
                  </td>
                </tr>

                <tr>
                  <td>
                    <h1 style="margin: 0 0 12px; font-size: 26px; line-height: 32px; font-weight: 700; color: ${navy};">
                      You are on the list
                    </h1>
                    <p style="margin: 0 0 28px; font-size: 16px; line-height: 24px; color: ${textSecondary};">
                      See what a recruiter would flag in your resume, before you apply.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding-bottom: 28px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border: 1px solid ${border}; border-radius: 12px;">
                      <tr>
                        <td style="padding: 24px 24px 4px;">
                          <span style="font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: ${textSecondary};">Example Recruiter Check</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 24px 4px;">
                          <span style="font-size: 32px; font-weight: 700; color: ${navy};">64%</span>
                          <span style="font-size: 14px; color: ${textSecondary};"> Interview Probability</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 0 24px 20px;">
                          <span style="font-size: 14px; font-weight: 700; color: ${warning};">Needs Improvement</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 0 24px 6px;">
                          <span style="font-size: 14px; color: ${success}; font-weight: 700;">&#10003;</span>
                          <span style="font-size: 14px; color: ${textSecondary};"> Quantified impact in your last two roles</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 0 24px 20px;">
                          <span style="font-size: 14px; color: ${warning}; font-weight: 700;">&#33;</span>
                          <span style="font-size: 14px; color: ${textSecondary};"> Missing a tool the job description names directly</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding-bottom: 12px;">
                    <span style="font-size: 15px; font-weight: 600; color: ${navy};">Run my Recruiter Check</span>
                  </td>
                </tr>

                <tr>
                  <td style="padding-bottom: 40px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="border-radius: 8px; background-color: ${blue};">
                          <a href="https://myrecruitercheck.com" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none;">
                            Check
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding-top: 24px; border-top: 1px solid ${border};">
                    <p style="margin: 24px 0 0; font-size: 12px; line-height: 18px; color: ${textSecondary};">
                      MyRecruiterCheck, think like a recruiter before you apply.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `
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

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

