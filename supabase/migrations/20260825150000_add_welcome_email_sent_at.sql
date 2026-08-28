-- Idempotency marker for the "Your account is ready" welcome email
-- (send-welcome-email edge function). Claimed atomically by flipping this
-- from null to now() with a WHERE welcome_email_sent_at IS NULL guard —
-- same pattern as checks.trustpilot_notified_at (see migration
-- 20260825140000_add_trustpilot_notified_at.sql) — so a retried or
-- duplicate-delivered webhook event can never send the welcome email
-- twice for the same user. Nullable/no default: unset means "not yet sent".
alter table public.profiles
  add column welcome_email_sent_at timestamptz;
