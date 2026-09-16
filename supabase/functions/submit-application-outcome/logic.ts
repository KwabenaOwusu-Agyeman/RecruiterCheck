// Pure validation for submit-application-outcome. Network free so it can be
// unit tested with `npx tsx`. Mirrors the check constraints on
// public.application_outcomes, so a request the database would reject is
// refused here with a clear message first.

export const CHANNELS = ['job_board', 'referral', 'company_site', 'other'] as const
export const STAGES = ['no_reply', 'rejected', 'interview', 'offer'] as const

export type Channel = (typeof CHANNELS)[number]
export type Stage = (typeof STAGES)[number]

export interface OutcomeAnswer {
  applied: boolean
  channel: Channel | null
  stage: Stage | null
  days_to_reply: number | null
  salary_offered: number | null
  salary_currency: string | null
  salary_country: string | null
}

export type ParsedRequest =
  | { ok: true; token: string; action: 'withdraw' }
  | { ok: true; token: string; action: 'lookup' }
  | { ok: true; token: string; action: 'answer'; answer: OutcomeAnswer }
  | { ok: false; error: string }

const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value)
}

function optionalInteger(value: unknown, min: number, max: number): number | null | undefined {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) return undefined
  return n
}

function optionalAmount(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'string' ? Number(value.replace(/[\s,]/g, '')) : value
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n >= 10_000_000) return undefined
  return Math.round(n * 100) / 100
}

export function parseRequest(body: unknown): ParsedRequest {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request.' }
  const input = body as Record<string, unknown>

  const token = typeof input.token === 'string' ? input.token.trim() : ''
  if (!isToken(token)) return { ok: false, error: 'This link is not valid.' }

  if (input.action === 'withdraw') return { ok: true, token, action: 'withdraw' }
  if (input.action === 'lookup') return { ok: true, token, action: 'lookup' }
  if (input.action !== 'answer') return { ok: false, error: 'Invalid request.' }

  if (typeof input.applied !== 'boolean') return { ok: false, error: 'Tell us whether you applied.' }

  if (!input.applied) {
    return {
      ok: true,
      token,
      action: 'answer',
      answer: {
        applied: false,
        channel: null,
        stage: null,
        days_to_reply: null,
        salary_offered: null,
        salary_currency: null,
        salary_country: null,
      },
    }
  }

  const channel = input.channel
  if (!CHANNELS.includes(channel as Channel)) return { ok: false, error: 'Choose how you applied.' }
  const stage = input.stage
  if (!STAGES.includes(stage as Stage)) return { ok: false, error: 'Choose how far it got.' }

  const days = optionalInteger(input.days_to_reply, 0, 365)
  if (days === undefined) return { ok: false, error: 'Days to reply must be a whole number up to 365.' }
  if (stage === 'no_reply' && days !== null) {
    return { ok: false, error: 'Leave days to reply empty if they have not replied.' }
  }

  let salary: number | null = null
  let currency: string | null = null
  let country: string | null = null
  if (stage === 'offer') {
    const amount = optionalAmount(input.salary_offered)
    if (amount === undefined) return { ok: false, error: 'Enter the salary as a number.' }
    if (amount !== null) {
      currency = typeof input.salary_currency === 'string' ? input.salary_currency.trim().toUpperCase() : ''
      country = typeof input.salary_country === 'string' ? input.salary_country.trim().toUpperCase() : ''
      if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: 'Choose the salary currency.' }
      if (!/^[A-Z]{2}$/.test(country)) return { ok: false, error: 'Choose the country of the job.' }
      salary = amount
    }
  }

  return {
    ok: true,
    token,
    action: 'answer',
    answer: {
      applied: true,
      channel: channel as Channel,
      stage: stage as Stage,
      days_to_reply: days,
      salary_offered: salary,
      salary_currency: salary === null ? null : currency,
      salary_country: salary === null ? null : country,
    },
  }
}
