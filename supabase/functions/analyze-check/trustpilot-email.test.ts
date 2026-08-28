// Run with: npx tsx supabase/functions/analyze-check/trustpilot-email.test.ts
import assert from 'node:assert/strict'
import { buildBrevoPayload, buildResultsEmailHtml, isTestAccountEmail, resolveSendDecision } from './trustpilot-email.ts'

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

const baseParams = {
  toEmail: 'candidate@example.com',
  recipientName: 'Jordan',
  jobTitle: 'Senior Backend Engineer',
  score: 82,
  resultsUrl: 'https://myrecruitercheck.com/checks/abc-123',
}

async function run() {
  await test('isTestAccountEmail matches an allowlisted address case-insensitively', () => {
    assert.equal(
      isTestAccountEmail('Fullcircle.AI@gmail.com', 'fullcircle.ai@gmail.com, other@test.com'),
      true,
    )
  })

  await test('isTestAccountEmail does not match an address outside the allowlist', () => {
    assert.equal(isTestAccountEmail('real.customer@example.com', 'fullcircle.ai@gmail.com'), false)
  })

  await test('isTestAccountEmail returns false when the env var is unset or empty', () => {
    assert.equal(isTestAccountEmail('anyone@example.com', undefined), false)
    assert.equal(isTestAccountEmail('anyone@example.com', ''), false)
  })

  await test('isTestAccountEmail tolerates whitespace and trailing commas in the list', () => {
    assert.equal(isTestAccountEmail('a@b.com', ' a@b.com , c@d.com, '), true)
  })

  await test('buildBrevoPayload includes the BCC when a Trustpilot address is provided', () => {
    const payload = buildBrevoPayload(baseParams, 'notifications@myrecruitercheck.com', 'MyRecruiterCheck', 'myrecruitercheck.com+abc@invite.trustpilot.com')
    assert.deepEqual(payload.bcc, [{ email: 'myrecruitercheck.com+abc@invite.trustpilot.com' }])
    assert.deepEqual(payload.to, [{ email: 'candidate@example.com' }])
    assert.deepEqual(payload.sender, { email: 'notifications@myrecruitercheck.com', name: 'MyRecruiterCheck' })
    assert.equal(payload.subject, 'Your Recruiter Check is ready')
  })

  await test('buildBrevoPayload omits bcc entirely when no Trustpilot address is configured', () => {
    const payload = buildBrevoPayload(baseParams, 'notifications@myrecruitercheck.com', 'MyRecruiterCheck', undefined)
    assert.equal('bcc' in payload, false)
  })

  await test('buildBrevoPayload omits bcc when the Trustpilot address is blank', () => {
    const payload = buildBrevoPayload(baseParams, 'notifications@myrecruitercheck.com', 'MyRecruiterCheck', '   ')
    assert.equal('bcc' in payload, false)
  })

  await test('buildResultsEmailHtml includes the results link and score', () => {
    const html = buildResultsEmailHtml(baseParams)
    assert.match(html, /https:\/\/myrecruitercheck\.com\/checks\/abc-123/)
    assert.match(html, /82%/)
    assert.match(html, /Hi Jordan,/)
    assert.match(html, /Senior Backend Engineer/)
  })

  await test('buildResultsEmailHtml never renders an employer name', () => {
    // Employer names are not shown anywhere, in-product or in email, so the
    // builder does not accept one at all. Guards against it being reintroduced.
    const html = buildResultsEmailHtml({ ...baseParams, jobTitle: 'Data Scientist' })
    assert.equal(html.includes('Acme Corp'), false)
    assert.equal(html.includes(' at '), false)
    assert.match(html, /for Data Scientist is complete/)
  })

  await test('buildResultsEmailHtml falls back to a generic greeting with no name', () => {
    const html = buildResultsEmailHtml({ ...baseParams, recipientName: null })
    assert.match(html, /Hi,/)
  })

  await test('buildResultsEmailHtml escapes HTML in the job title', () => {
    const html = buildResultsEmailHtml({
      ...baseParams,
      jobTitle: '<script>alert(1)</script> A & B "Co"',
    })
    assert.equal(html.includes('<script>alert(1)</script>'), false)
    assert.match(html, /&lt;script&gt;/)
    assert.match(html, /A &amp; B &quot;Co&quot;/)
  })

  await test('resolveSendDecision: test mode + designated test account sends without BCC', () => {
    assert.deepEqual(resolveSendDecision(true, true), { shouldSend: true, includeBcc: false, reason: 'send' })
  })

  await test('resolveSendDecision: test mode + non-test account is blocked', () => {
    assert.deepEqual(resolveSendDecision(true, false), {
      shouldSend: false,
      includeBcc: false,
      reason: 'blocked_not_test_account_in_test_mode',
    })
  })

  await test('resolveSendDecision: production + non-test account sends with BCC', () => {
    assert.deepEqual(resolveSendDecision(false, false), { shouldSend: true, includeBcc: true, reason: 'send' })
  })

  await test('resolveSendDecision: production + test account is skipped', () => {
    assert.deepEqual(resolveSendDecision(false, true), {
      shouldSend: false,
      includeBcc: false,
      reason: 'skipped_test_account_in_production',
    })
  })

  console.log(`\n${passed} passed`)
}

await run()
