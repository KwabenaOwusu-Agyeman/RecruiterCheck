// Generates the four static Supabase Auth email templates in
// supabase/templates/ from the SAME shared builders that produce every other
// MyRecruiterCheck email (supabase/functions/_shared/email/).
//
// Why this script exists: these four files used to be hand-authored copies of
// the shared shell. When the shell was redesigned, the copies were not, so
// the signup email a real user receives silently kept the old look while
// every app-sent email moved on. Generating them removes the duplication that
// made that drift possible.
//
// Run with: npx tsx scripts/render-auth-templates.ts
// Then paste each file into Supabase Dashboard > Authentication >
// Email Templates (the hosted project does not read these files directly;
// supabase/config.toml wires them up for local dev only).

import { writeFileSync } from 'node:fs'
import {
  buildEmailChangePreview,
  buildPasswordChangedEmail,
  buildResetPasswordPreview,
  buildVerifyEmailPreview,
} from '../supabase/functions/_shared/email/templates.ts'

// Supabase substitutes these server-side. They contain no HTML-significant
// characters, so they survive the shell's escaping untouched.
const CONFIRMATION_URL = '{{ .ConfirmationURL }}'
const NEW_EMAIL = '{{ .NewEmail }}'

function header(dashboardLocation: string): string {
  return `<!--
  GENERATED FILE — do not edit by hand.
  Run: npx tsx scripts/render-auth-templates.ts

  Built from supabase/functions/_shared/email/templates.ts so this template
  always matches every other MyRecruiterCheck email. Editing it directly will
  be overwritten, and re-introduces the drift this script exists to prevent.

  Paste into: Supabase Dashboard > Authentication > Email Templates > ${dashboardLocation}
-->
`
}

const templates = [
  {
    file: 'confirmation.html',
    dashboard: 'Confirm signup',
    html: buildVerifyEmailPreview(CONFIRMATION_URL).html,
  },
  {
    file: 'recovery.html',
    dashboard: 'Reset password',
    html: buildResetPasswordPreview(CONFIRMATION_URL).html,
  },
  {
    file: 'email_change.html',
    dashboard: 'Change email address',
    // Show the actual address being confirmed rather than "this email
    // address" — the placeholder only exists in the Supabase-sent version,
    // so it is substituted here rather than baked into the shared builder.
    html: buildEmailChangePreview(CONFIRMATION_URL).html.replace(
      'this email address',
      `<strong style="color: #020C38;">${NEW_EMAIL}</strong>`,
    ),
  },
  {
    file: 'security_password_changed.html',
    dashboard: 'Password changed (security notice)',
    html: buildPasswordChangedEmail().html,
  },
]

for (const { file, dashboard, html } of templates) {
  const outPath = new URL(`../supabase/templates/${file}`, import.meta.url)
  writeFileSync(outPath, header(dashboard) + html, 'utf-8')
  console.log(`wrote supabase/templates/${file}`)
}

console.log('\nAll four Auth templates regenerated from the shared email shell.')
