// Timezone-aware period and bucket maths for the dashboard.
//
// Every figure on the dashboard is scoped to a window, and every window
// boundary is a local midnight in the admin's own IANA timezone, not UTC. A
// founder in Europe/London asking for "today" means their day, and getting
// that wrong silently shifts revenue and signups between days.
//
// No date library is used: Intl.DateTimeFormat already knows every zone's
// rules, including DST, so the offset is derived from it rather than assumed.

export type PeriodId = '7d' | '30d' | '90d' | '12m' | 'ytd' | 'all' | 'custom'
export type Grouping = 'day' | 'week' | 'month' | 'year'

export interface Window {
  /** Inclusive lower bound. */
  from: Date
  /** Exclusive upper bound. */
  to: Date
}

export interface ResolvedPeriod extends Window {
  id: PeriodId
  timezone: string
  /**
   * The equivalent window immediately before this one, for comparisons.
   * Null when a comparison is not meaningful, which is the case for
   * 'all' (nothing precedes it) and 'ytd' (the prior year to date is a
   * different length in a leap year and rarely what is wanted).
   */
  previous: Window | null
}

interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const PART_FORMATTERS = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let cached = PART_FORMATTERS.get(timeZone)
  if (!cached) {
    cached = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    PART_FORMATTERS.set(timeZone, cached)
  }
  return cached
}

/** Wall-clock parts of `instant` as seen in `timeZone`. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant)
  const lookup: Record<string, string> = {}
  for (const part of parts) lookup[part.type] = part.value
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  }
}

/** Milliseconds that `timeZone` is ahead of UTC at `instant`. */
function offsetMsAt(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone)
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  // formatToParts drops sub-second precision, so compare on whole seconds.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000
}

/**
 * The UTC instant at which the given wall-clock time occurs in `timeZone`.
 *
 * Solved by iteration: guess that the local time is UTC, measure the offset
 * there, correct, then re-measure. Two passes settle the DST boundaries where
 * the offset on either side of the guess differs.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second)
  let corrected = naive - offsetMsAt(new Date(naive), timeZone)
  corrected = naive - offsetMsAt(new Date(corrected), timeZone)
  return new Date(corrected)
}

/** Local midnight opening the day that contains `instant`. */
export function startOfDay(instant: Date, timeZone: string): Date {
  const p = zonedParts(instant, timeZone)
  return zonedTimeToUtc(p.year, p.month, p.day, 0, 0, 0, timeZone)
}

/** Local midnight opening the ISO week (Monday) that contains `instant`. */
export function startOfWeek(instant: Date, timeZone: string): Date {
  const dayStart = startOfDay(instant, timeZone)
  const p = zonedParts(dayStart, timeZone)
  // getUTCDay on a UTC-constructed local date gives the local weekday.
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()
  const daysSinceMonday = (weekday + 6) % 7
  return addDays(dayStart, -daysSinceMonday, timeZone)
}

export function startOfMonth(instant: Date, timeZone: string): Date {
  const p = zonedParts(instant, timeZone)
  return zonedTimeToUtc(p.year, p.month, 1, 0, 0, 0, timeZone)
}

export function startOfYear(instant: Date, timeZone: string): Date {
  const p = zonedParts(instant, timeZone)
  return zonedTimeToUtc(p.year, 1, 1, 0, 0, 0, timeZone)
}

/**
 * Add calendar days, preserving local midnight across DST changes. Adding a
 * flat 24h would drift by an hour twice a year and land at 23:00 or 01:00.
 */
export function addDays(instant: Date, days: number, timeZone: string): Date {
  const p = zonedParts(instant, timeZone)
  return zonedTimeToUtc(p.year, p.month, p.day + days, p.hour, p.minute, p.second, timeZone)
}

export function addMonths(instant: Date, months: number, timeZone: string): Date {
  const p = zonedParts(instant, timeZone)
  const target = p.month - 1 + months
  const year = p.year + Math.floor(target / 12)
  const month = ((target % 12) + 12) % 12
  // Clamp the day so 31 January minus one month is 28/29 February, not 3 March.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const day = Math.min(p.day, lastDay)
  return zonedTimeToUtc(year, month + 1, day, p.hour, p.minute, p.second, timeZone)
}

export function startOfBucket(instant: Date, grouping: Grouping, timeZone: string): Date {
  switch (grouping) {
    case 'day':
      return startOfDay(instant, timeZone)
    case 'week':
      return startOfWeek(instant, timeZone)
    case 'month':
      return startOfMonth(instant, timeZone)
    case 'year':
      return startOfYear(instant, timeZone)
  }
}

export function nextBucket(bucketStart: Date, grouping: Grouping, timeZone: string): Date {
  switch (grouping) {
    case 'day':
      return addDays(bucketStart, 1, timeZone)
    case 'week':
      return addDays(bucketStart, 7, timeZone)
    case 'month':
      return addMonths(bucketStart, 1, timeZone)
    case 'year':
      return addMonths(bucketStart, 12, timeZone)
  }
}

/** Every bucket start covering `window`, ascending. */
export function bucketStarts(window: Window, grouping: Grouping, timeZone: string): Date[] {
  const out: Date[] = []
  let cursor = startOfBucket(window.from, grouping, timeZone)
  // A very wide window at day grouping is the pathological case; cap the
  // series rather than build an unbounded array.
  const LIMIT = 2000
  while (cursor < window.to && out.length < LIMIT) {
    out.push(cursor)
    cursor = nextBucket(cursor, grouping, timeZone)
  }
  return out
}

/** The earliest instant the product could have data for. */
export const DATA_EPOCH = new Date('2026-08-07T00:00:00.000Z')

export function resolvePeriod(
  id: PeriodId,
  timeZone: string,
  now: Date,
  custom?: { from: Date; to: Date },
): ResolvedPeriod {
  const today = startOfDay(now, timeZone)
  // `to` is exclusive and sits at the start of tomorrow, so that rows written
  // later today are still inside "today" without a moving upper bound making
  // two cards on the same page disagree.
  const to = addDays(today, 1, timeZone)

  const spanDays = (days: number): ResolvedPeriod => {
    const from = addDays(today, -(days - 1), timeZone)
    return {
      id,
      timezone: timeZone,
      from,
      to,
      previous: { from: addDays(from, -days, timeZone), to: from },
    } as ResolvedPeriod
  }

  switch (id) {
    case '7d':
      return spanDays(7)
    case '30d':
      return spanDays(30)
    case '90d':
      return spanDays(90)
    case '12m': {
      const from = startOfMonth(addMonths(today, -11, timeZone), timeZone)
      return {
        id,
        timezone: timeZone,
        from,
        to,
        previous: { from: startOfMonth(addMonths(from, -12, timeZone), timeZone), to: from },
      }
    }
    case 'ytd':
      // No previous window: the prior year to date is a different length in a
      // leap year, so the comparison would quietly mislead.
      return { id, timezone: timeZone, from: startOfYear(today, timeZone), to, previous: null }
    case 'all':
      return { id, timezone: timeZone, from: DATA_EPOCH, to, previous: null }
    case 'custom': {
      if (!custom) throw new Error('resolvePeriod: custom period requires from and to')
      const from = startOfDay(custom.from, timeZone)
      const customTo = addDays(startOfDay(custom.to, timeZone), 1, timeZone)
      const lengthMs = customTo.getTime() - from.getTime()
      return {
        id,
        timezone: timeZone,
        from,
        to: customTo,
        previous: { from: new Date(from.getTime() - lengthMs), to: from },
      }
    }
  }
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}
