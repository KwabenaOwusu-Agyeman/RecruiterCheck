import { requireAdmin } from '@/server/auth'
import { serviceClient } from '@/server/supabase'
import { csvResponse, EXPORT_LIMIT } from '../csvResponse'

export const dynamic = 'force-dynamic'

interface Row {
  id: number
  entry_type: string
  credit_type: string
  amount: number
  note: string | null
  created_at: string
  related_check_id: string | null
  batch_id: string | null
  profiles: { email: string } | null
}

export async function GET() {
  await requireAdmin()

  const { data, error } = await serviceClient()
    .from('check_ledger')
    .select(
      'id, entry_type, credit_type, amount, note, created_at, related_check_id, batch_id, profiles!inner(email)',
    )
    .order('created_at', { ascending: false })
    .limit(EXPORT_LIMIT)

  if (error) return new Response(`Export failed: ${error.message}`, { status: 500 })

  const rows = (data ?? []) as unknown as Row[]

  return csvResponse('credit-ledger', rows, [
    { header: 'Entry ID', value: (r) => r.id },
    { header: 'Customer', value: (r) => r.profiles?.email ?? '' },
    { header: 'Entry type', value: (r) => r.entry_type },
    { header: 'Credit type', value: (r) => r.credit_type },
    { header: 'Amount', value: (r) => r.amount },
    { header: 'Related check', value: (r) => r.related_check_id },
    { header: 'Batch', value: (r) => r.batch_id },
    { header: 'Note', value: (r) => r.note },
    { header: 'When', value: (r) => r.created_at },
  ])
}
