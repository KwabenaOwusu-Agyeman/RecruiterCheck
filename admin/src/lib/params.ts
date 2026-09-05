// Parsing of URL search params into safe, bounded values.
//
// Everything here treats the query string as hostile input: it is user
// controlled and reaches database queries. Unrecognised values fall back to a
// default rather than being passed through.

import type { Grouping, PeriodId } from './time'

const PERIOD_IDS: readonly PeriodId[] = ['7d', '30d', '90d', '12m', 'ytd', 'all', 'custom']
const GROUPINGS: readonly Grouping[] = ['day', 'week', 'month', 'year']

export const DEFAULT_PERIOD: PeriodId = '30d'
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

export function parsePeriod(value: string | undefined): PeriodId {
  return PERIOD_IDS.includes(value as PeriodId) ? (value as PeriodId) : DEFAULT_PERIOD
}

export function parseGrouping(value: string | undefined, fallback: Grouping = 'day'): Grouping {
  return GROUPINGS.includes(value as Grouping) ? (value as Grouping) : fallback
}

/** 1-based page number, clamped to something sane. */
export function parsePage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed) || parsed < 1) return 1
  // An unbounded page number lets someone request an arbitrarily large offset,
  // which is a cheap way to make the database do expensive work.
  return Math.min(parsed, 10_000)
}

export function parsePageSize(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_PAGE_SIZE
  return Math.min(parsed, MAX_PAGE_SIZE)
}

export interface Range {
  from: number
  to: number
}

/** Inclusive row range for a Supabase .range() call. */
export function pageRange(page: number, pageSize: number): Range {
  const from = (page - 1) * pageSize
  return { from, to: from + pageSize - 1 }
}

export function totalPages(totalRows: number, pageSize: number): number {
  if (totalRows <= 0) return 1
  return Math.ceil(totalRows / pageSize)
}

/**
 * Trims and bounds a free-text search term.
 * Returns null for an empty search so callers can skip filtering entirely.
 */
export function parseSearch(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return null
  return trimmed.slice(0, 200)
}

/**
 * Escapes a search term for PostgREST's `ilike` filter.
 *
 * PostgREST treats a comma as a value separator and parentheses as grouping
 * inside filter expressions, and % and _ are SQL wildcards. Left unescaped, a
 * term containing them either breaks the query or silently matches far more
 * than intended.
 */
export function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/[(),]/g, ' ')
}

export function parseCustomRange(
  from: string | undefined,
  to: string | undefined,
): { from: Date; to: Date } | null {
  if (!from || !to) return null
  const start = new Date(from)
  const end = new Date(to)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  if (start > end) return null
  return { from: start, to: end }
}
