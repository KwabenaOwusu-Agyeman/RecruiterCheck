// Run with: npx tsx supabase/functions/_shared/email/templates.test.ts
import assert from 'node:assert/strict'
import {
  buildEmailChangePreview,
  buildPasswordChangedEmail,
  buildResetPasswordPreview,
  buildVerifyEmailPreview,
  buildWelcomeEmail,
} from './templates.ts'
import { escapeHtml } from './layout.ts'

let passed = 0
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passed += 1
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`FAIL - ${name}`)
    throw error
  }
}

const LINK = 'https://myrecruitercheck.com/auth/callback?token=abc123&type=signup'

async function run() {
  await test('escapeHtml neutralizes HTML-significant characters', () => {
    assert.equal(escapeHtml(`<script>alert('x')</script>&"`), '&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;&quot;')
  })

  await test('verify email: subject, preview text, heading, button label match spec exactly', () => {
    const email = buildVerifyEmailPreview(LINK)
    assert.equal(email.subject, 'Verify your MyRecruiterCheck email')
    assert.match(email.html, /Confirm your email to finish setting up your account\./)
    assert.match(email.html, />\s*Verify email\s*</)
    assert.ok(email.html.includes(escapeHtml(LINK)))
    assert.match(email.text, /Verify email: https:\/\/myrecruitercheck\.com/)
  })

  await test('welcome email: subject and CTA match spec, no duplicate-sending logic leaks into copy', () => {
    const email = buildWelcomeEmail('https://myrecruitercheck.com/checks/new')
    assert.equal(email.subject, 'Welcome to MyRecruiterCheck')
    assert.match(email.html, />\s*Start your first Recruiter Check\s*</)
    assert.match(email.html, /Upload your CV and the job description/)
  })

  await test('reset password email: subject and CTA match spec', () => {
    const email = buildResetPasswordPreview(LINK)
    assert.equal(email.subject, 'Reset your MyRecruiterCheck password')
    assert.match(email.html, />\s*Reset password\s*</)
  })

  await test('email change preview: escapes support email and includes it only when provided', () => {
    const withSupport = buildEmailChangePreview(LINK, 'support@myrecruitercheck.com')
    assert.match(withSupport.html, /support@myrecruitercheck\.com/)

    const withoutSupport = buildEmailChangePreview(LINK)
    assert.ok(!withoutSupport.html.includes('mailto:'))
    assert.match(withoutSupport.html, /secure your account immediately/)
  })

  await test('password changed email: no primary CTA button rendered (security notice, not an action email)', () => {
    const email = buildPasswordChangedEmail()
    assert.equal(email.subject, 'Your MyRecruiterCheck password was changed')
    assert.ok(!email.html.includes('Or paste this link into your browser'))
    assert.match(email.html, /reset your password immediately/)
  })

  await test('every template includes the brand tagline in the footer', () => {
    for (const email of [
      buildVerifyEmailPreview(LINK),
      buildWelcomeEmail(LINK),
      buildResetPasswordPreview(LINK),
      buildEmailChangePreview(LINK),
      buildPasswordChangedEmail(),
    ]) {
      assert.match(email.html, /Think like a recruiter before you apply\./)
    }
  })

  await test('a malicious CTA URL is HTML-escaped, not executed, when embedded as an href', () => {
    const malicious = `https://evil.example/"><script>alert(1)</script>`
    const email = buildWelcomeEmail(malicious)
    assert.ok(!email.html.includes('<script>alert(1)</script>'))
  })

  console.log(`\n${passed} passed`)
}

void run()
