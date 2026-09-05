import type { Database } from './database'

// The admin tables and the auth summary view are part of the generated schema
// now that 20260905120000 and 20260905123000 are applied, so this module is a
// thin set of aliases rather than a type merge.
//
// An earlier version declared them here and intersected them into the
// generated Database. That typechecked for reads but silently broke
// supabase-js's .insert() overload for EVERY table, resolving it to never[].
// Generating the types from the real schema is both simpler and correct.

export type { Database, Json } from './database'

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type Views<T extends keyof Database['public']['Views']> =
  Database['public']['Views'][T]['Row']

export type AdminUserRow = Tables<'admin_users'>
export type AdminAuditLogRow = Tables<'admin_audit_log'>
export type AdminSupportNoteRow = Tables<'admin_support_notes'>
export type AdminAuthUserSummaryRow = Views<'admin_auth_user_summary'>

export type CheckRow = Tables<'checks'>
export type ProfileRow = Tables<'profiles'>
export type CreditBatchRow = Tables<'credit_batches'>
export type CheckLedgerRow = Tables<'check_ledger'>
export type RefundEventRow = Tables<'refund_events'>
export type StripeWebhookEventRow = Tables<'stripe_webhook_events'>

export type CheckStatus = Database['public']['Enums']['check_status']
export type AdminActionResult = AdminAuditLogRow['result']
export type SupportNoteStatus = AdminSupportNoteRow['status']
export type SupportNoteCategory = AdminSupportNoteRow['category']
