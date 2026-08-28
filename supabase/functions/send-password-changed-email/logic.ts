// Pure, network-free logic for send-password-changed-email — see
// send-welcome-email/logic.ts for why this is split out, and
// BREVO_SETUP.md for the Database Webhook wiring this function expects.

export interface AuthUserWebhookPayload {
  type: string
  table: string
  record: { id?: string; email?: string; encrypted_password?: string } | null
  old_record: { encrypted_password?: string } | null
}

/**
 * True only when the stored password hash actually changed on this update.
 * auth.users rows update for many unrelated reasons (last_sign_in_at,
 * metadata, etc.), so comparing hashes — not just "was this an UPDATE" — is
 * what keeps this a real password-changed notice instead of a noisy one
 * fired on every login.
 */
export function didPasswordChange(payload: AuthUserWebhookPayload): boolean {
  if (payload.type !== 'UPDATE' || payload.table !== 'users') return false
  const before = payload.old_record?.encrypted_password
  const after = payload.record?.encrypted_password
  return Boolean(before) && Boolean(after) && before !== after
}

export function extractUser(payload: AuthUserWebhookPayload): { id: string; email: string } | null {
  const id = payload.record?.id
  const email = payload.record?.email
  if (!id || !email) return null
  return { id, email }
}
