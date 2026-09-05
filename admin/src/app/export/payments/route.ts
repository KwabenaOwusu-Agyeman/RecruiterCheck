import { requireAdmin } from '@/server/auth'
import { serviceClient } from '@/server/supabase'
import { csvResponse, EXPORT_LIMIT } from '../csvResponse'

export const dynamic = 'force-dynamic'

interface Row {
  id: string
  pack_id: string | null
  checks_granted: number
  checks_remaining: number
  amount_paid: number | null
  currency: string | null
  paid_at: string | null
  refund_status: string
  stripe_payment_intent_id: string | null
  stripe_checkout_session_id: string | null
  profiles: { email: string } | null
}

export async function GET() {
  await requireAdmin()

  const { data, error } = await serviceClient()
    .from('credit_batches')
    .select(
      'id, pack_id, checks_granted, checks_remaining, amount_paid, currency, paid_at, refund_status, stripe_payment_intent_id, stripe_checkout_session_id, profiles!inner(email)',
    )
    .eq('source', 'purchase')
    .order('paid_at', { ascending: false, nullsFirst: false })
    .limit(EXPORT_LIMIT)

  if (error) return new Response(`Export failed: ${error.message}`, { status: 500 })

  const rows = (data ?? []) as unknown as Row[]

  return csvResponse('payments', rows, [
    { header: 'Batch ID', value: (r) => r.id },
    { header: 'Customer', value: (r) => r.profiles?.email ?? '' },
    { header: 'Pack', value: (r) => r.pack_id },
    // Minor units, so a spreadsheet cannot silently misread the decimal.
    { header: 'Amount (minor units)', value: (r) => r.amount_paid },
    { header: 'Currency', value: (r) => r.currency },
    { header: 'Credits granted', value: (r) => r.checks_granted },
    { header: 'Credits remaining', value: (r) => r.checks_remaining },
    { header: 'Refund status', value: (r) => r.refund_status },
    { header: 'Paid at', value: (r) => r.paid_at },
    { header: 'Payment intent', value: (r) => r.stripe_payment_intent_id },
    { header: 'Checkout session', value: (r) => r.stripe_checkout_session_id },
  ])
}
