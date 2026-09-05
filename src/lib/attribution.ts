// First-touch acquisition attribution.
//
// Records where a visitor came from, once, so that signups can later be
// attributed to a channel. Until this existed nothing in the system recorded
// acquisition at all: every one of the 23 SEO landing pages fired an identical
// bare `landing_view`, so "which page earns its keep" was unanswerable.
//
// Three deliberate limits:
//
// FIRST TOUCH ONLY. The first visit wins and is never overwritten. Someone who
// arrives from a search result and returns a week later by typing the address
// is still credited to search, which is the useful answer.
//
// HOST, NEVER THE FULL REFERRING URL. A referring URL's query string routinely
// carries personal data (search terms, session ids, occasionally an email).
// Only the hostname is kept.
//
// FIRST PARTY ONLY. No third-party tag, no pixel, no cross-site identifier.
// This is consistent with the anonymous analytics_events inserts the site
// already makes. If a cookie banner is added later, gate this behind it.
//
// The parsing functions below are pure so they can be tested without a DOM;
// everything touching localStorage is isolated at the bottom and always
// wrapped, because storage throws in Safari private mode and a marketing
// nicety must never break the page.

/** Bound every field. These land in a table `anon` can INSERT into. */
const MAX_PARAM = 100
const MAX_PATH = 200
const MAX_HOST = 253

export interface Attribution {
  source: string | null
  medium: string | null
  campaign: string | null
  landingPath: string | null
  referrerHost: string | null
  capturedAt: string
}

/**
 * Trims, strips control characters, and caps length. Returns null for anything
 * empty so a blank parameter is stored as "unknown" rather than as "".
 */
export function sanitizeParam(value: string | null | undefined, max = MAX_PARAM): string | null {
  if (typeof value !== 'string') return null
  // Strip control characters with explicit escapes rather than literal bytes,
  // so the source stays plain ASCII and readable.
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, '').trim()
  if (!cleaned) return null
  return cleaned.slice(0, max)
}

export interface UtmValues {
  source: string | null
  medium: string | null
  campaign: string | null
}

/** Reads utm_source, utm_medium and utm_campaign from a query string. */
export function parseUtm(search: string): UtmValues {
  let params: URLSearchParams
  try {
    params = new URLSearchParams(search)
  } catch {
    return { source: null, medium: null, campaign: null }
  }
  return {
    source: sanitizeParam(params.get('utm_source')),
    medium: sanitizeParam(params.get('utm_medium')),
    campaign: sanitizeParam(params.get('utm_campaign')),
  }
}

/**
 * The hostname of an external referrer, or null.
 *
 * Same-origin referrers are dropped: an internal navigation is not an
 * acquisition, and treating one as such would credit the site with sending
 * traffic to itself.
 */
export function parseReferrerHost(referrer: string, currentHost: string): string | null {
  if (!referrer) return null
  try {
    const host = new URL(referrer).hostname.toLowerCase()
    if (!host) return null
    if (host === currentHost.toLowerCase()) return null
    return host.slice(0, MAX_HOST)
  } catch {
    return null
  }
}

/** Path only. The query string is deliberately not stored. */
export function sanitizePath(pathname: string): string | null {
  return sanitizeParam(pathname, MAX_PATH)
}

/**
 * Builds the attribution record for a visit. Pure: callers pass the values
 * rather than this reaching for `window`.
 */
export function buildAttribution(input: {
  search: string
  referrer: string
  currentHost: string
  pathname: string
  now: Date
}): Attribution {
  const utm = parseUtm(input.search)
  return {
    source: utm.source,
    medium: utm.medium,
    campaign: utm.campaign,
    landingPath: sanitizePath(input.pathname),
    referrerHost: parseReferrerHost(input.referrer, input.currentHost),
    capturedAt: input.now.toISOString(),
  }
}

/**
 * Whether a record says anything useful. A visit with no UTM and no external
 * referrer is direct traffic; the landing path alone is still worth keeping,
 * so this only rejects a record that is entirely empty.
 */
export function hasAnySignal(attribution: Attribution): boolean {
  return Boolean(
    attribution.source ||
      attribution.medium ||
      attribution.campaign ||
      attribution.referrerHost ||
      attribution.landingPath,
  )
}

/**
 * Narrows a stored value back to an Attribution, rejecting anything that does
 * not match. localStorage is user-writable, so what comes back out is
 * untrusted input, not something this module wrote.
 */
export function parseStoredAttribution(raw: string | null): Attribution | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as Record<string, unknown>
    const capturedAt = typeof record.capturedAt === 'string' ? record.capturedAt : null
    if (!capturedAt || Number.isNaN(new Date(capturedAt).getTime())) return null

    const field = (key: string, max = MAX_PARAM) =>
      typeof record[key] === 'string' ? sanitizeParam(record[key] as string, max) : null

    return {
      source: field('source'),
      medium: field('medium'),
      campaign: field('campaign'),
      landingPath: field('landingPath', MAX_PATH),
      referrerHost: field('referrerHost', MAX_HOST),
      capturedAt,
    }
  } catch {
    return null
  }
}

// --- browser side ------------------------------------------------------------

export const STORAGE_KEY = 'mrc_attribution_v1'

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    // Safari private mode and blocked third-party storage both throw on access.
    return null
  }
}

/** The stored first touch, or null if absent, unreadable or malformed. */
export function readFirstTouch(): Attribution | null {
  const store = safeLocalStorage()
  if (!store) return null
  try {
    return parseStoredAttribution(store.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

/**
 * Records this visit as first touch if nothing is stored yet, and returns
 * whatever the first touch now is. Never overwrites, and never throws.
 */
export function captureFirstTouch(now = new Date()): Attribution | null {
  if (typeof window === 'undefined') return null

  const existing = readFirstTouch()
  if (existing) return existing

  const attribution = buildAttribution({
    search: window.location.search,
    referrer: typeof document === 'undefined' ? '' : document.referrer,
    currentHost: window.location.hostname,
    pathname: window.location.pathname,
    now,
  })

  if (!hasAnySignal(attribution)) return null

  const store = safeLocalStorage()
  if (store) {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(attribution))
    } catch {
      // Quota exceeded or storage disabled. The visit is simply unattributed;
      // it must not interrupt anything the visitor is doing.
    }
  }

  return attribution
}

/** The UTM values on the CURRENT page, for tagging an individual event. */
export function currentPageContext(): {
  pagePath: string | null
  utm: UtmValues
  referrerHost: string | null
} {
  if (typeof window === 'undefined') {
    return { pagePath: null, utm: { source: null, medium: null, campaign: null }, referrerHost: null }
  }
  return {
    pagePath: sanitizePath(window.location.pathname),
    utm: parseUtm(window.location.search),
    referrerHost: parseReferrerHost(
      typeof document === 'undefined' ? '' : document.referrer,
      window.location.hostname,
    ),
  }
}
