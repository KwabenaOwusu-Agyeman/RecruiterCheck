// Builders for all FIVE MyRecruiterCheck transactional emails this app
// sends (verify, welcome, reset password, email change, password changed)
// on top of the shared shell in layout.ts. Magic-link sign-in is the sixth
// email in the original brief but is intentionally not implemented: the
// app only supports email/password and OAuth (Google, LinkedIn) sign-in —
// see src/services/authService.ts — so there is no Supabase magic-link
// flow to brand.
//
// Two of the five (welcome, password-changed) are sent from edge functions
// via Brevo's API. The other three (verify, reset password, email change)
// are sent by Supabase Auth itself from its own template rendering, so
// they are NOT wired to Brevo here — instead the equivalent HTML lives as
// static files in supabase/templates/*.html using Supabase's Go-template
// variables. Their builders are still kept here (behind the same shell)
// purely so previews/tests can render the full five-email set from one
// source of truth; see scripts/render-email-previews.ts.

import { buildEmailShell, buildPlainText, escapeHtml } from './layout.ts'

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

// ---------------------------------------------------------------------------
// 1. Verify email (Supabase-sent — preview only, see supabase/templates/confirmation.html)
// ---------------------------------------------------------------------------

export function buildVerifyEmailPreview(confirmationUrl: string): RenderedEmail {
  const heading = 'Verify your email'
  const bodyHtml =
    'Thanks for creating your MyRecruiterCheck account. Confirm your email address to finish setting up your account.'
  const supportingHtml =
    'This link will expire according to the current Supabase authentication configuration. If you did not create this account, you can ignore this email.'

  return {
    subject: 'Verify your MyRecruiterCheck email',
    html: buildEmailShell({
      documentTitle: 'Verify your MyRecruiterCheck email',
      previewText: 'Confirm your email to finish setting up your account.',
      heading,
      bodyHtml,
      cta: { label: 'Verify email', url: confirmationUrl },
      supportingHtml,
    }),
    text: buildPlainText({
      heading,
      bodyLines: [
        'Thanks for creating your MyRecruiterCheck account.',
        'Confirm your email address to finish setting up your account.',
      ],
      cta: { label: 'Verify email', url: confirmationUrl },
      supportingLines: [
        'This link will expire according to the current Supabase authentication configuration.',
        'If you did not create this account, you can ignore this email.',
      ],
    }),
  }
}

// ---------------------------------------------------------------------------
// 2. Welcome (app-triggered via Brevo, sent once after verification)
// ---------------------------------------------------------------------------

export function buildWelcomeEmail(startCheckUrl: string): RenderedEmail {
  const heading = 'Your account is ready'
  const bodyHtml =
    'Welcome to MyRecruiterCheck. You can now check how well your CV matches a role before you apply.'
  const supportingHtml = 'Upload your CV and the job description to receive recruiter style feedback.'

  return {
    subject: 'Welcome to MyRecruiterCheck',
    html: buildEmailShell({
      documentTitle: 'Welcome to MyRecruiterCheck',
      previewText: 'Your account is ready.',
      heading,
      bodyHtml,
      cta: { label: 'Start your first Recruiter Check', url: startCheckUrl },
      supportingHtml,
    }),
    text: buildPlainText({
      heading,
      bodyLines: [
        'Welcome to MyRecruiterCheck.',
        'You can now check how well your CV matches a role before you apply.',
      ],
      cta: { label: 'Start your first Recruiter Check', url: startCheckUrl },
      supportingLines: ['Upload your CV and the job description to receive recruiter style feedback.'],
    }),
  }
}

// ---------------------------------------------------------------------------
// 3. Reset password (Supabase-sent — preview only, see supabase/templates/recovery.html)
// ---------------------------------------------------------------------------

export function buildResetPasswordPreview(resetUrl: string): RenderedEmail {
  const heading = 'Reset your password'
  const bodyHtml = 'We received a request to reset the password for your MyRecruiterCheck account.'
  const supportingHtml =
    'If you did not request this change, you can ignore this email. We will never ask for your password by email.'

  return {
    subject: 'Reset your MyRecruiterCheck password',
    html: buildEmailShell({
      documentTitle: 'Reset your MyRecruiterCheck password',
      previewText: 'Use this secure link to choose a new password.',
      heading,
      bodyHtml,
      cta: { label: 'Reset password', url: resetUrl },
      supportingHtml,
    }),
    text: buildPlainText({
      heading,
      bodyLines: ['We received a request to reset the password for your MyRecruiterCheck account.'],
      cta: { label: 'Reset password', url: resetUrl },
      supportingLines: [
        'If you did not request this change, you can ignore this email.',
        'We will never ask for your password by email.',
      ],
    }),
  }
}

// ---------------------------------------------------------------------------
// 5. Email address change (Supabase-sent — preview only, see supabase/templates/email_change.html)
// ---------------------------------------------------------------------------

export function buildEmailChangePreview(confirmationUrl: string, supportEmail?: string): RenderedEmail {
  const heading = 'Confirm your email change'
  const bodyHtml = 'Confirm that you want to use this email address for your MyRecruiterCheck account.'
  const supportingHtml = supportEmail
    ? `If you did not request this change, secure your account and contact <a href="mailto:${escapeHtml(supportEmail)}" style="color: #194A9F;">${escapeHtml(supportEmail)}</a>.`
    : 'If you did not request this change, secure your account immediately.'

  return {
    subject: 'Confirm your new email address',
    html: buildEmailShell({
      documentTitle: 'Confirm your new email address',
      previewText: 'Confirm this change for your MyRecruiterCheck account.',
      heading,
      bodyHtml,
      cta: { label: 'Confirm new email', url: confirmationUrl },
      supportingHtml,
    }),
    text: buildPlainText({
      heading,
      bodyLines: ['Confirm that you want to use this email address for your MyRecruiterCheck account.'],
      cta: { label: 'Confirm new email', url: confirmationUrl },
      supportingLines: [
        supportEmail
          ? `If you did not request this change, secure your account and contact ${supportEmail}.`
          : 'If you did not request this change, secure your account immediately.',
      ],
    }),
  }
}

// ---------------------------------------------------------------------------
// 6. Password changed (app-triggered via Brevo, security notice — no promotional CTA)
// ---------------------------------------------------------------------------

export function buildPasswordChangedEmail(): RenderedEmail {
  const heading = 'Password changed'
  const bodyHtml = 'The password for your MyRecruiterCheck account was successfully changed.'
  const supportingHtml =
    'If you made this change, no action is required. If you did not make it, reset your password immediately and review your account.'

  return {
    subject: 'Your MyRecruiterCheck password was changed',
    // No `cta` — this is a security notice, not an action email. A normal
    // call-to-action button here would make a compromise notice look like
    // marketing, and there is no real recovery link to send safely.
    html: buildEmailShell({
      documentTitle: 'Your MyRecruiterCheck password was changed',
      previewText: 'A security update was made to your account.',
      heading,
      bodyHtml,
      supportingHtml,
    }),
    text: buildPlainText({
      heading,
      bodyLines: ['The password for your MyRecruiterCheck account was successfully changed.'],
      supportingLines: [
        'If you made this change, no action is required.',
        'If you did not make it, reset your password immediately and review your account.',
      ],
    }),
  }
}
