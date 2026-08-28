// Renders every MyRecruiterCheck transactional email to static HTML
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
import { buildResultsEmailHtml } from '../supabase/functions/analyze-check/trustpilot-email.ts'

const SAMPLE_LINK = 'https://xyzcompany.supabase.co/auth/v1/verify?token=abcdef123456&type=signup&redirect_to=https://myrecruitercheck.com/auth/callback'

const outDir = new URL('../.scratch/email-previews/', import.meta.url)
mkdirSync(outDir, { recursive: true })

const emails = {
  '1-verify-email': buildVerifyEmailPreview(SAMPLE_LINK),
  '2-welcome': buildWelcomeEmail('https://myrecruitercheck.com/checks/new'),
  '3-reset-password': buildResetPasswordPreview(SAMPLE_LINK),
  '5-email-change': buildEmailChangePreview(SAMPLE_LINK),
  '6-password-changed': buildPasswordChangedEmail(),
  // Not built by templates.ts (it lives with the analyze-check function),
  // but it shares the same shell, so it belongs in the same visual review.
  '7-check-ready': {
    subject: 'Your Recruiter Check is ready',
    html: buildResultsEmailHtml({
      recipientName: 'Kwabena',
      jobTitle: 'Data Scientist',
      score: 70,
      resultsUrl: 'https://myrecruitercheck.com/checks/9f2c1a44-0b3e-4d51-9c7a-2b8e5f0d1a67',
    }),
    text: 'Your Recruiter Check is ready',
  },
}

for (const [name, email] of Object.entries(emails)) {
  writeFileSync(new URL(`${name}.html`, outDir), email.html, 'utf-8')
  writeFileSync(new URL(`${name}.txt`, outDir), email.text, 'utf-8')
  console.log(`wrote ${name}.html / .txt — subject: "${email.subject}"`)
}

console.log(`\nAll previews written to ${outDir.pathname}`)
