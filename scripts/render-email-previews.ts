// Renders all six MyRecruiterCheck transactional emails to static HTML
// files for manual review (desktop/mobile preview, screenshotting) without
// sending anything or needing the Deno runtime.
//
// Run with: npx tsx scripts/render-email-previews.ts
// Output: .scratch/email-previews/*.html (gitignored scratch output, not a build artifact)

import { mkdirSync, writeFileSync } from 'node:fs'
import {
  buildEmailChangePreview,
  buildPasswordChangedEmail,
  buildResetPasswordPreview,
  buildVerifyEmailPreview,
  buildWelcomeEmail,
} from '../supabase/functions/_shared/email/templates.ts'

const SAMPLE_LINK = 'https://xyzcompany.supabase.co/auth/v1/verify?token=abcdef123456&type=signup&redirect_to=https://myrecruitercheck.com/auth/callback'

const outDir = new URL('../.scratch/email-previews/', import.meta.url)
mkdirSync(outDir, { recursive: true })

const emails = {
  '1-verify-email': buildVerifyEmailPreview(SAMPLE_LINK),
  '2-welcome': buildWelcomeEmail('https://myrecruitercheck.com/checks/new'),
  '3-reset-password': buildResetPasswordPreview(SAMPLE_LINK),
  '5-email-change': buildEmailChangePreview(SAMPLE_LINK),
  '6-password-changed': buildPasswordChangedEmail(),
}

for (const [name, email] of Object.entries(emails)) {
  writeFileSync(new URL(`${name}.html`, outDir), email.html, 'utf-8')
  writeFileSync(new URL(`${name}.txt`, outDir), email.text, 'utf-8')
  console.log(`wrote ${name}.html / .txt — subject: "${email.subject}"`)
}

console.log(`\nAll previews written to ${outDir.pathname}`)
