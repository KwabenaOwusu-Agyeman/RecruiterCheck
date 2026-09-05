import { requireAdmin } from '@/server/auth'
import { serviceClient } from '@/server/supabase'
import { escapeLikeTerm, parseSearch } from '@/lib/params'
import { csvResponse, EXPORT_LIMIT } from '../csvResponse'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // A route handler is a public endpoint, so it re-checks authorisation itself
  // rather than trusting that it is only ever reached from a gated page.
  await requireAdmin()

  const search = parseSearch(new URL(request.url).searchParams.get('q') ?? undefined)

  let query = serviceClient()
    .from('profiles')
    .select('id, email, full_name, created_at, checks_balance, lifetime_checks_consumed')
    .order('created_at', { ascending: false })
    .limit(EXPORT_LIMIT)

  if (search) {
    const term = escapeLikeTerm(search)
    query = query.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`)
  }

  const { data, error } = await query
  if (error) return new Response(`Export failed: ${error.message}`, { status: 500 })

  return csvResponse('users', data ?? [], [
    { header: 'User ID', value: (r) => r.id },
    { header: 'Email', value: (r) => r.email },
    { header: 'Name', value: (r) => r.full_name },
    { header: 'Signed up', value: (r) => r.created_at },
    { header: 'Credit balance', value: (r) => r.checks_balance },
    { header: 'Checks used', value: (r) => r.lifetime_checks_consumed },
  ])
}
