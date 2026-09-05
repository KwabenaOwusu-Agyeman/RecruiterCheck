import 'server-only'
import { escapeLikeTerm, pageRange } from '@/lib/params'
import type { Db } from '../supabase'
import type { AdminAuthUserSummaryRow, ProfileRow } from '@/types/db'

// The user directory joins two sources: profiles (the application's own record,
// carrying balances and consumption) and admin_auth_user_summary (the auth
// record, carrying verification and last sign-in). They are 1:1 through the
// on_auth_user_created trigger.
//
// Profiles is queried first because it is the searchable, paginable side, then
// the auth rows for that page are fetched by id. Fetching every auth row and
// filtering in memory would not survive growth.

export interface UserListRow {
  id: string
  email: string
  fullName: string | null
  createdAt: string
  lastSignInAt: string | null
  emailConfirmedAt: string | null
  checksBalance: number
  lifetimeChecksConsumed: number
}

export interface UserListResult {
  rows: UserListRow[]
  totalRows: number
  error: string | null
}

export async function listUsers(
  db: Db,
  { search, page, pageSize }: { search: string | null; page: number; pageSize: number },
): Promise<UserListResult> {
  const range = pageRange(page, pageSize)

  let query = db
    .from('profiles')
    .select('id, email, full_name, created_at, checks_balance, lifetime_checks_consumed', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(range.from, range.to)

  if (search) {
    // Escaped before interpolation: an unescaped % turns a search into a full
    // table dump, and a comma breaks out of the PostgREST filter expression.
    const term = escapeLikeTerm(search)
    query = query.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`)
  }

  const { data, count, error } = await query
  if (error) return { rows: [], totalRows: 0, error: error.message }

  const profiles = (data ?? []) as Pick<
    ProfileRow,
    'id' | 'email' | 'full_name' | 'created_at' | 'checks_balance' | 'lifetime_checks_consumed'
  >[]

  const authById = new Map<string, AdminAuthUserSummaryRow>()
  if (profiles.length > 0) {
    const { data: authRows } = await db
      .from('admin_auth_user_summary')
      .select('id, email, created_at, last_sign_in_at, email_confirmed_at, banned_until, deleted_at')
      .in(
        'id',
        profiles.map((p) => p.id),
      )
    for (const row of (authRows ?? []) as AdminAuthUserSummaryRow[]) {
      if (row.id) authById.set(row.id, row)
    }
  }

  return {
    rows: profiles.map((profile) => {
      const auth = authById.get(profile.id)
      return {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        createdAt: profile.created_at,
        lastSignInAt: auth?.last_sign_in_at ?? null,
        emailConfirmedAt: auth?.email_confirmed_at ?? null,
        checksBalance: profile.checks_balance,
        lifetimeChecksConsumed: profile.lifetime_checks_consumed,
      }
    }),
    totalRows: count ?? 0,
    error: null,
  }
}

export interface UserDetail {
  profile: ProfileRow
  auth: AdminAuthUserSummaryRow | null
  checks: {
    id: string
    job_title: string | null
    company_name: string | null
    status: string
    created_at: string
    funding_pack_id: string | null
    uploads_purged: boolean
    uploads_purged_at: string | null
  }[]
  batches: {
    id: string
    source: string
    pack_id: string | null
    checks_granted: number
    checks_remaining: number
    amount_paid: number | null
    currency: string | null
    paid_at: string | null
    expires_at: string | null
    refund_status: string
  }[]
  ledger: {
    id: number
    entry_type: string
    credit_type: string
    amount: number
    note: string | null
    created_at: string
    related_check_id: string | null
  }[]
  refunds: {
    id: string
    status: string
    stripe_refund_id: string | null
    reason: string | null
    created_at: string
    finalized_at: string | null
  }[]
  notes: {
    id: string
    body: string
    category: string
    status: string
    created_at: string
    admin_user_id: string
  }[]
}

export async function getUserDetail(db: Db, userId: string): Promise<UserDetail | null> {
  const { data: profile } = await db.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (!profile) return null

  const [auth, checks, batches, ledger, refunds, notes] = await Promise.all([
    db.from('admin_auth_user_summary').select('*').eq('id', userId).maybeSingle(),
    db
      .from('checks')
      // Deliberately no job_description and no cv fields: operating the
      // business needs the title, the status and whether the file is gone,
      // never the document itself.
      .select(
        'id, job_title, company_name, status, created_at, funding_pack_id, uploads_purged, uploads_purged_at',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100),
    db
      .from('credit_batches')
      .select(
        'id, source, pack_id, checks_granted, checks_remaining, amount_paid, currency, paid_at, expires_at, refund_status',
      )
      .eq('user_id', userId)
      .order('granted_at', { ascending: false })
      .limit(100),
    db
      .from('check_ledger')
      .select('id, entry_type, credit_type, amount, note, created_at, related_check_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200),
    db
      .from('refund_events')
      .select('id, status, stripe_refund_id, reason, created_at, finalized_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
    db
      .from('admin_support_notes')
      .select('id, body, category, status, created_at, admin_user_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  return {
    profile: profile as ProfileRow,
    auth: (auth.data as AdminAuthUserSummaryRow | null) ?? null,
    checks: checks.data ?? [],
    batches: batches.data ?? [],
    ledger: ledger.data ?? [],
    refunds: refunds.data ?? [],
    notes: notes.data ?? [],
  }
}
