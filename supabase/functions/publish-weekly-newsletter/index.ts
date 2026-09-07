import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { renderIssue, validateIssue, type Issue } from '../_shared/newsletter/issue.ts'
import { loadPiece } from '../_shared/newsletter/piece.ts'
import {
  BREVO_CAMPAIGN_ENDPOINT,
  FEEDS,
  REQUIRED_POSTINGS,
  absolutise,
  angleForWeek,
  buildCampaignPayload,
  buildGenerationRequestBody,
  buildPieceSource,
  imagesForWeek,
  isoWeek,
  nextMondayNineAm,
  parseArbeitnow,
  parseGeneration,
  parseRemotive,
  periodLabel,
  selectPostings,
  toPostings,
  type FeedItem,
} from './logic.ts'

// Builds and schedules one weekly newsletter issue.
//
// Invoked exclusively by the publish-weekly-newsletter pg_cron job over HTTP
// via pg_net, authorized with the project's service-role key from Supabase
// Vault. Same shape as purge-expired-uploads and instagram-refresh-token.
//
// The gateway's verify_jwt only proves the bearer is *some* valid
// Supabase-signed JWT: an anon key or any logged-in user's access token also
// passes it. So the token's own `role` claim is checked here before anything
// happens. Without it, any authenticated user could make the product email its
// entire subscriber list.
//
// The role claim is decoded rather than byte-compared against
// SUPABASE_SERVICE_ROLE_KEY. That comparison looks stricter and is wrong: this
// project's Vault key is a validly signed token for this project but does not
// byte-match the runtime's injected env var. It has already broken one
// function here.
//
// No CORS: nothing in a browser calls this.
//
// FAIL CLOSED. Every path that cannot produce a complete, valid issue records
// a failure and creates no campaign. A skipped week is a non-event. A broken
// issue in twenty thousand inboxes cannot be undone.

const FEED_TIMEOUT_MS = 15000
const OPENAI_TIMEOUT_MS = 45000
const BREVO_TIMEOUT_MS = 20000

/** Two attempts, the second carrying the validator's complaint. */
const MAX_GENERATION_ATTEMPTS = 2

/** How far back to look when avoiding a repeated role or a repeated angle. */
const RECENT_ISSUES = 8

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** One feed's failure costs its own postings, never the issue. */
async function loadFeed(url: string, parse: (payload: unknown) => FeedItem[]): Promise<FeedItem[]> {
  try {
    const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, FEED_TIMEOUT_MS)
    if (!response.ok) {
      console.warn('publish-weekly-newsletter: feed returned non-ok', { url, status: response.status })
      return []
    }
    return parse(await response.json())
  } catch (error) {
    console.warn('publish-weekly-newsletter: feed unavailable', {
      url,
      message: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

Deno.serve(async (req) => {
  if (!isServiceRoleRequest(req)) return jsonResponse({ error: 'Unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const now = new Date()
  const { year, week } = isoWeek(now)

  // dryRun builds and returns the whole issue but creates no campaign and
  // writes no row. It is how this gets exercised without touching the list.
  let dryRun = false
  try {
    const body = await req.json()
    dryRun = body?.dryRun === true
  } catch {
    // No body is the normal cron case.
  }

  const fail = async (reason: string, status: number) => {
    console.error('publish-weekly-newsletter: aborted', { year, week, reason })
    if (!dryRun) {
      await admin
        .from('newsletter_issues')
        .upsert({ year, week, status: 'failed', error: reason }, { onConflict: 'year,week' })
    }
    return jsonResponse({ error: reason, year, week }, status)
  }

  try {
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    const brevoKey = Deno.env.get('BREVO_API_KEY')
    const listId = Number(Deno.env.get('BREVO_NEWSLETTER_LIST_ID') ?? '0')
    if (!openaiKey) return await fail('OPENAI_API_KEY is not set', 503)
    if (!brevoKey) return await fail('BREVO_API_KEY is not set', 503)
    if (!dryRun && listId <= 0) return await fail('BREVO_NEWSLETTER_LIST_ID is not set', 503)

    // Idempotence. cron.schedule fires once, but a retry or a manual invoke
    // must not produce a second campaign for the same week.
    const { data: existing } = await admin
      .from('newsletter_issues')
      .select('id, campaign_id')
      .eq('year', year).eq('week', week).eq('status', 'scheduled')
      .maybeSingle()
    if (existing && !dryRun) {
      return jsonResponse({ skipped: 'already scheduled', year, week, campaignId: existing.campaign_id })
    }

    const { data: recent, error: recentError } = await admin
      .from('newsletter_issues')
      .select('postings, rejection_heading')
      .eq('status', 'scheduled')
      .order('created_at', { ascending: false })
      .limit(RECENT_ISSUES)
    if (recentError) return await fail(`Could not read recent issues: ${recentError.message}`, 500)

    const alreadySent = (recent ?? []).flatMap((row) =>
      Array.isArray(row.postings) ? row.postings.map((p: { url?: string }) => p?.url).filter(Boolean) : [],
    ) as string[]
    const avoidHeadings = (recent ?? [])
      .map((row) => row.rejection_heading)
      .filter((h): h is string => typeof h === 'string' && h.length > 0)

    const [remotive, arbeitnow] = await Promise.all([
      loadFeed(FEEDS.remotive, parseRemotive),
      loadFeed(FEEDS.arbeitnow, parseArbeitnow),
    ])
    const postings = selectPostings([...remotive, ...arbeitnow], alreadySent)
    if (postings.length < REQUIRED_POSTINGS) {
      return await fail(
        `Only ${postings.length} usable postings after dedupe, need ${REQUIRED_POSTINGS}`,
        503,
      )
    }

    const images = imagesForWeek(week)
    const angle = angleForWeek(week)

    // Generate, render, and let validateIssue decide. A failure feeds its own
    // complaint back so the second attempt is a correction rather than a
    // repeat of the request that just failed.
    let issue: Issue | null = null
    let html = ''
    let subject = ''
    let rejectionHeading = ''
    let lastProblem: string | null = null

    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS && !issue; attempt += 1) {
      const response = await fetchWithTimeout(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
          body: JSON.stringify(buildGenerationRequestBody(postings, angle, avoidHeadings, lastProblem)),
        },
        OPENAI_TIMEOUT_MS,
      )
      if (!response.ok) {
        lastProblem = `OpenAI returned ${response.status}`
        continue
      }

      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
      const rawText = payload.choices?.[0]?.message?.content
      if (!rawText) {
        lastProblem = 'Empty response from the generation service'
        continue
      }

      let generated
      try {
        generated = parseGeneration(JSON.parse(rawText), REQUIRED_POSTINGS)
      } catch (error) {
        lastProblem = error instanceof Error ? error.message : String(error)
        continue
      }

      // Through the same loader an authored piece uses, so the generated prose
      // is held to the identical copy rules with no second implementation.
      const rejection = loadPiece('rejection', buildPieceSource(generated.rejection.heading, images.rejection, generated.rejection.body))
      const trends = loadPiece('trends', buildPieceSource(generated.trends.heading, images.trends, generated.trends.body))
      if (!rejection.piece || !trends.piece) {
        lastProblem = [...rejection.problems, ...trends.problems].join(' ')
        continue
      }

      const candidate: Issue = {
        week,
        period: periodLabel(now),
        greeting: 'Hi {{ contact.FIRSTNAME }},',
        intro: generated.intro,
        postings: toPostings(postings, generated.postingNotes),
        rejection: { ...rejection.piece, image: rejection.piece.image && { ...rejection.piece.image, url: absolutise(rejection.piece.image.url) } },
        trends: { ...trends.piece, image: trends.piece.image && { ...trends.piece.image, url: absolutise(trends.piece.image.url) } },
        cta: {
          heading: 'Find out which line lost it',
          body: 'Run your CV against the job you want, before you send it.',
          label: 'Check',
          url: `${absolutise('/')}`,
        },
        signOff: { name: 'Kwabena', role: 'Founder of MyRecruiterCheck' },
      }

      const problems = validateIssue(candidate)
      if (problems.length > 0) {
        lastProblem = problems.join(' ')
        continue
      }

      issue = candidate
      html = renderIssue(candidate)
      subject = generated.subject
      rejectionHeading = generated.rejection.heading
    }

    if (!issue) {
      return await fail(`Copy failed validation after ${MAX_GENERATION_ATTEMPTS} attempts: ${lastProblem}`, 502)
    }

    const scheduledAt = nextMondayNineAm(now)

    if (dryRun) {
      return jsonResponse({
        dryRun: true, year, week, subject,
        scheduledAt: scheduledAt.toISOString(),
        postings: issue.postings, html,
      })
    }

    const campaignResponse = await fetchWithTimeout(
      BREVO_CAMPAIGN_ENDPOINT,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': brevoKey, Accept: 'application/json' },
        body: JSON.stringify(buildCampaignPayload({
          year, week, subject, html, listId, scheduledAt,
          senderName: Deno.env.get('BREVO_SENDER_NAME') ?? 'MyRecruiterCheck',
          senderEmail: Deno.env.get('BREVO_SENDER_EMAIL') ?? 'notifications@myrecruitercheck.com',
          replyTo: Deno.env.get('BREVO_REPLY_TO_EMAIL') ?? undefined,
        })),
      },
      BREVO_TIMEOUT_MS,
    )
    if (!campaignResponse.ok) {
      // Status only. A Brevo error body can echo the payload back, and the
      // payload is the entire issue.
      return await fail(`Brevo campaign creation returned ${campaignResponse.status}`, 502)
    }
    const campaign = await campaignResponse.json() as { id?: number }

    const { error: writeError } = await admin.from('newsletter_issues').upsert({
      year, week,
      status: 'scheduled',
      subject,
      html,
      postings: issue.postings,
      rejection_heading: rejectionHeading,
      campaign_id: campaign.id ?? null,
      scheduled_at: scheduledAt.toISOString(),
      error: null,
    }, { onConflict: 'year,week' })
    if (writeError) {
      // The campaign exists and will send. Say so loudly rather than reporting
      // a failure that would be read as "nothing went out".
      console.error('publish-weekly-newsletter: campaign scheduled but not recorded', {
        year, week, campaignId: campaign.id, message: writeError.message,
      })
    }

    console.log('publish-weekly-newsletter: scheduled', {
      year, week, campaignId: campaign.id, scheduledAt: scheduledAt.toISOString(),
      postings: issue.postings.length,
    })

    return jsonResponse({
      year, week, campaignId: campaign.id ?? null, scheduledAt: scheduledAt.toISOString(),
    })
  } catch (error) {
    return await fail(error instanceof Error ? error.message : String(error), 500)
  }
})
