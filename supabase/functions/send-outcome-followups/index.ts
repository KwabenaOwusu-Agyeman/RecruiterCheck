import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { sendTransactionalEmail } from '../_shared/email/brevoClient.ts'
import {
  BATCH_SIZE,
  buildOutcomeFollowupEmail,
  buildOutcomeUrl,
  decideFollowup,
  isTestAccountEmail,
  isTestMode,
} from './logic.ts'

// Invoked daily by the send-outcome-followups pg_cron job (migration
// 20260916200000_application_outcomes.sql) with the service role key from
// Vault. The gateway's verify_jwt only proves the bearer is some valid JWT,
// so the role claim is checked here as well, exactly as in
// purge-expired-uploads and publish-weekly-newsletter.
//
// Rows are claimed atomically (marked sent) before any email goes out, so
// overlapping runs cannot double send. A row that is held by test mode or
// whose send fails is released for a later run.
//
// OUTCOME_FOLLOWUP_TEST_MODE fails closed: unless it is exactly 'false', only
// addresses in TEST_ACCOUNT_EMAILS are emailed.
//
// Never log email addresses, tokens or links. Only row ids and counts.

function isServiceRoleRequest(req: Request): boolean {
  const match = (req.headers.get('Authorization') ?? '').match(/^Bearer (.+)$/)
  if (!match) return false

  const parts = match[1].split('.')
  if (parts.length !== 3) return false

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    return (JSON.parse(atob(padded)) as { role?: string })?.role === 'service_role'
  } catch {
    return false
  }
}

interface ClaimedRow {
  id: string
  check_id: string
  user_id: string
  followup_token: string
}

Deno.serve(async (req) => {
  if (!isServiceRoleRequest(req)) return jsonResponse({ error: 'Unauthorized' }, 401)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const testMode = isTestMode(Deno.env.get('OUTCOME_FOLLOWUP_TEST_MODE'))
  const testAccounts = Deno.env.get('TEST_ACCOUNT_EMAILS')
  const siteUrl = Deno.env.get('SITE_URL') ?? 'https://myrecruitercheck.com'

  const { data: claimed, error: claimError } = await db.rpc('claim_application_outcome_followups', {
    p_limit: BATCH_SIZE,
  })
  if (claimError) {
    console.error('[send-outcome-followups] claim failed:', claimError.code)
    return jsonResponse({ error: 'claim failed' }, 500)
  }

  const rows = (claimed ?? []) as ClaimedRow[]
  const counts = { claimed: rows.length, sent: 0, held: 0, failed: 0 }

  for (const row of rows) {
    const release = async (countAttempt = true) => {
      const { error } = await db.rpc('release_application_outcome_followup', {
        p_id: row.id,
        p_count_attempt: countAttempt,
      })
      if (error) console.error('[send-outcome-followups] release failed:', row.id, error.code)
    }

    const [{ data: profile }, { data: check }] = await Promise.all([
      db.from('profiles').select('email, full_name').eq('id', row.user_id).maybeSingle(),
      db.from('checks').select('job_title').eq('id', row.check_id).maybeSingle(),
    ])

    if (!profile?.email) {
      counts.failed += 1
      await release()
      continue
    }

    if (decideFollowup(testMode, isTestAccountEmail(profile.email, testAccounts)) === 'hold_test_mode') {
      counts.held += 1
      // Held rows must not burn one of the five attempts.
      await release(false)
      continue
    }

    const email = buildOutcomeFollowupEmail({
      jobTitle: check?.job_title ?? null,
      outcomeUrl: buildOutcomeUrl(siteUrl, row.followup_token),
    })
    const result = await sendTransactionalEmail({
      toEmail: profile.email,
      toName: profile.full_name,
      subject: email.subject,
      htmlContent: email.html,
      textContent: email.text,
    })

    if (result.sent) {
      counts.sent += 1
    } else {
      counts.failed += 1
      console.error('[send-outcome-followups] send failed:', row.id, result.reason)
      await release()
    }
  }

  console.log('[send-outcome-followups]', JSON.stringify({ testMode, ...counts }))
  return jsonResponse({ testMode, ...counts })
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
