# Brevo email setup for MyRecruiterCheck

This is the manual, dashboard-only setup for the email system implemented in this repo. Nothing here can be done from the codebase or by Claude — it all requires your Brevo and Supabase logins. No credentials are written in this file.

**Phase 1 scope:** verify email, welcome after verification, reset password, change email address, password changed security notice. Feedback-ready, payment, refund, credit, and marketing emails are out of scope for this phase.

## Architecture

Two channels:

1. **Supabase Auth emails** (verify email, reset password, confirm email change, password changed) — sent by **Supabase itself**, using **Brevo as custom SMTP**. Supabase already owns secure token generation/expiry/single-use for the first three; the fourth (password changed) uses Supabase's own built-in Auth security notification feature, not a custom link. Magic-link sign-in is not implemented because the app doesn't use it.
2. **Welcome email** — sent by a **Supabase Edge Function** (`send-welcome-email`) calling the **Brevo transactional API** directly. It is invoked by the **authenticated client app itself** (right after email verification, and opportunistically again on later logins), not by a Database Webhook.

**Why not Database Webhooks:** this project's Supabase instance is on the free plan and is missing the `supabase_functions` schema the dashboard's Webhooks feature depends on internally. That schema is platform-managed infrastructure, not something a project's own migrations create — recreating it ourselves, using `pg_net` directly, or adding a custom database trigger were all ruled out as workarounds. The application-triggered design below needs none of that: `send-welcome-email` requires a valid Supabase access token (`verify_jwt = true`), so Supabase's own gateway rejects any unauthenticated call before the function code ever runs, and the function derives the caller's identity from that token — never from anything the browser sends.

`send-password-changed-email` (the other edge function from the original webhook-based design) is **deployed but inactive** — nothing calls it. It's kept, not deleted, in case the native Supabase notification below doesn't work out in testing.

---

## 1. Brevo: verify your sending domain

Already complete — `myrecruitercheck.com` is verified in Brevo (DKIM, DMARC, and branding records all confirmed matching).

## 2. Brevo: sender identity

Already complete — **MyRecruiterCheck** `<notifications@myrecruitercheck.com>` is verified in Brevo. Do not change this sender identity; it's referenced throughout this setup and the codebase's `BREVO_SENDER_EMAIL`/`BREVO_SENDER_NAME` defaults.

## 3. Brevo: SMTP credentials for Supabase Auth

Already complete — Supabase's **Authentication → Settings → SMTP Settings** is configured with Brevo's SMTP relay.

## 4. Supabase: auth email templates

Already complete — **Confirm signup**, **Reset Password**, and **Change Email Address** are pasted into Supabase's Email Templates and confirmed rendering correctly in Preview. Source files: `supabase/templates/confirmation.html`, `recovery.html`, `email_change.html`.

## 5. Supabase: redirect URLs

Already complete — Site URL and the `/auth/callback` / `/auth/reset-password` redirect URLs are set.

## 6. Supabase: password changed security notification (not yet enabled)

Authentication → Emails → Security → **Password changed** already exists on this project (confirmed) with its own **Subject** field and an HTML **Body** field (Source/Preview toggle, same as the other templates) — currently toggled off.

**Still to do:**
1. Open **Password changed** → paste the complete contents of `supabase/templates/security_password_changed.html` into the Body's Source view — a full HTML document using the same shell (navy header, light grey outer background, white card, standard footer) as `confirmation.html`/`recovery.html`/`email_change.html`, with no call-to-action button and no template variables.
2. Set **Subject** to `Your MyRecruiterCheck password was changed`.
3. Toggle **Enable notification** on, then **Save changes**.

This sends via the same Brevo SMTP configuration as the other Auth emails — no edge function, no code, involved.

## 7. Supabase: welcome email rollout secret (not yet set)

`send-welcome-email` reads `WELCOME_EMAIL_ROLLOUT_AT` (an edge function secret) to decide eligibility — see the main report for the exact proposed value and how it's enforced. **Still to do**, once you're ready to deploy:

1. Confirm the exact rollout timestamp (proposed: `2026-08-27T00:00:00Z`, adjustable to your actual deploy day).
2. Set it as an Edge Function secret: `WELCOME_EMAIL_ROLLOUT_AT=<that ISO 8601 value>`.
3. Confirm `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, and `SITE_URL` are already set (they should be, from the existing "check ready" email setup).

## 8. Deploying `send-welcome-email` (not yet done)

No Database Webhook, no `supabase_functions` schema, no database trigger — none of that is needed for this design. Once the rollout secret above is set:

```bash
supabase functions deploy send-welcome-email
```

That's the entire deployment step. The function is invoked directly by the app (`src/services/welcomeEmailService.ts`) using the signed-in user's own session token — nothing in Supabase's dashboard needs to be wired up beyond the secret.

`send-password-changed-email` should **not** be deployed again or re-wired — it stays as-is (deployed, inactive) until the native security notification (Section 6) has been tested successfully, at which point it can be deleted.

## 9. Vercel: environment variables

None needed. All secrets live in Supabase Edge Function secrets, never in the frontend bundle.

## 10. Testing without emailing real users

- Supabase Auth emails (verify, reset, email change, password changed): use a personal test address, or Brevo's dashboard **Transactional → Logs** to inspect sends.
- Welcome email: since it's invoked by the authenticated app itself, testing it means signing up/logging in with a real test account after deployment — there's no webhook payload to intercept anymore. Check Brevo's **Transactional → Logs** for the send, and the Supabase Edge Function's own logs for any errors.
- The existing `TRUSTPILOT_EMAIL_TEST_MODE` / `TEST_ACCOUNT_EMAILS` pattern is specific to the results-ready email and doesn't gate this function.

## 11. Brevo delivery, bounce, and failure logs

Brevo dashboard → **Transactional** → **Logs** (or **Statistics**) shows delivered/opened/bounced/blocked status per message, searchable by recipient.

---

## Manual testing checklist

- [ ] New user signs up → verification email arrives, branded, from the Brevo-relayed sender
- [ ] Verify-email button lands on `/auth/callback`, signs the user in, and the welcome email arrives shortly after (only if the account was created on/after the rollout cutoff)
- [ ] Reopening/refreshing the verification link, or logging in again afterward, does not send a second welcome email
- [ ] A pre-existing verified user (created before the rollout cutoff) never receives a welcome email, no matter how many times they log in
- [ ] An unauthenticated request to `send-welcome-email` (no Authorization header) is rejected
- [ ] Password reset: request → email arrives → link opens `/auth/reset-password` → new password works
- [ ] Password change → the native Supabase security notification arrives, branded, via Brevo
- [ ] Email change: request → confirmation email arrives at the *new* address → confirming updates the account
- [ ] An expired or already-used link shows a clear error, not a silent failure
- [ ] All five emails are readable with images/remote content blocked
- [ ] Mobile Gmail app and Apple Mail render correctly
- [ ] No secret appears in the built client bundle or in any function log

---

## Automated tests in this repo

```bash
npx tsx supabase/functions/_shared/email/templates.test.ts
npx tsx supabase/functions/send-welcome-email/logic.test.ts
npx tsx supabase/functions/send-welcome-email/index.test.ts
npx tsx supabase/functions/send-password-changed-email/logic.test.ts
```

To regenerate static HTML/text previews of the emails for manual review:

```bash
npx tsx scripts/render-email-previews.ts
```
