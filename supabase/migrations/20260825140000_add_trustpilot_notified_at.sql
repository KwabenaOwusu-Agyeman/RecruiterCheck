-- Idempotency marker for the "Your Recruiter Check is ready" transactional
-- email (Trustpilot AFS integration). analyze-check claims a check for
-- sending by atomically flipping this from null to now() with a
-- WHERE trustpilot_notified_at IS NULL guard, so a retried request (or two
-- concurrent requests) can never send the notification twice for the same
-- check. Nullable/no default: unset means "not yet notified".
alter table public.checks
  add column trustpilot_notified_at timestamptz;
