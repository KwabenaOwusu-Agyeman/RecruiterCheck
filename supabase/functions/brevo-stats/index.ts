// Read-only Brevo proxy for the admin dashboard.
//
// The dashboard needs email performance figures, and the obvious way to get
// them would be a second copy of BREVO_API_KEY in Vercel. This exists so that
// copy is never made: the key stays in exactly one place, this function's
// secrets, and the dashboard authenticates with the service-role key it already
// holds.
//
// It can only READ, and only from a fixed set of Brevo endpoints built in
// logic.ts. There is no send path here of any kind, and no request field can
// steer it at a different URL.

import {
  brevoPathFor,
  isServiceRoleToken,
  matchesServiceRoleKey,
  parseAction,
  shapeCampaigns,
  shapeList,
  shapeTransactional,
  toReportRange,
} from './logic.ts'

const BREVO_BASE = 'https://api.brevo.com/v3'
const TIMEOUT_MS = 8000

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  // Two checks, and the second is the one that matters. The claim decode is a
  // cheap filter; proving the caller actually holds the service-role key is the
  // gate, so authorisation does not depend on the gateway's verify_jwt default
  // staying true. An ordinary signed-in customer presents a valid JWT and is
  // rejected by both.
  const authorization = req.headers.get('Authorization')
  if (
    !isServiceRoleToken(authorization) ||
    !matchesServiceRoleKey(authorization, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
  ) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const apiKey = Deno.env.get('BREVO_API_KEY')
  if (!apiKey) {
    // Reported as its own state so the dashboard can say "not connected"
    // rather than rendering zeros that read as "no email was delivered".
    return jsonResponse({ state: 'not_configured', detail: 'BREVO_API_KEY is not set.' }, 200)
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const action = parseAction(body.action)
  if (!action) {
    return jsonResponse({ error: 'Unknown action' }, 400)
  }

  const range = action === 'transactional' ? toReportRange(body.from, body.to) : undefined
  if (action === 'transactional' && !range) {
    return jsonResponse({ error: 'Invalid date range' }, 400)
  }

  const path = brevoPathFor(action, {
    range: range ?? undefined,
    listId: Deno.env.get('BREVO_NEWSLETTER_LIST_ID') ?? undefined,
  })
  if (!path) {
    return jsonResponse(
      {
        state: 'not_configured',
        detail:
          action === 'list'
            ? 'BREVO_NEWSLETTER_LIST_ID is not set, so the Brevo list size cannot be read.'
            : 'This request could not be built.',
      },
      200,
    )
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(`${BREVO_BASE}${path}`, {
      headers: { 'api-key': apiKey, accept: 'application/json' },
      signal: controller.signal,
    })

    if (!response.ok) {
      // The status is safe to pass on; the body is not, since Brevo echoes
      // request detail back and this ends up rendered on a page.
      console.error(`[brevo-stats] ${action} returned ${response.status}`)
      return jsonResponse(
        { state: 'failed', detail: `Brevo returned ${response.status} for this request.` },
        200,
      )
    }

    const raw = await response.json()
    const data =
      action === 'transactional'
        ? shapeTransactional(raw)
        : action === 'list'
          ? shapeList(raw)
          : shapeCampaigns(raw)

    return jsonResponse({ state: 'ok', data })
  } catch (error) {
    // Never the raw error: it can carry the outbound URL and headers.
    console.error(
      `[brevo-stats] ${action} failed:`,
      error instanceof Error ? error.name : 'unknown',
    )
    return jsonResponse({ state: 'failed', detail: 'Could not reach Brevo.' }, 200)
  } finally {
    clearTimeout(timer)
  }
})
