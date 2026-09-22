// Run with: npx tsx supabase/functions/send-outcome-followups/logic.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildOutcomeFollowupEmail,
  buildOutcomeUrl,
  decideFollowup,
  isTestAccountEmail,
  isTestMode,
} from './logic.ts'

let passed = 0
function test(name: string, fn: () => void) {
  try {
    fn()
    passed += 1
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`FAIL - ${name}`)
    throw error
  }
}

const TOKEN = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'

test('test mode stays on unless the secret is exactly false', () => {
  assert.equal(isTestMode(undefined), true)
  assert.equal(isTestMode(null), true)
  assert.equal(isTestMode(''), true)
  assert.equal(isTestMode('true'), true)
  assert.equal(isTestMode('off'), true)
  assert.equal(isTestMode('0'), true)
  assert.equal(isTestMode('false'), false)
  assert.equal(isTestMode(' FALSE '), false)
})

test('in test mode only test accounts are emailed', () => {
  assert.equal(decideFollowup(true, true), 'send')
  assert.equal(decideFollowup(true, false), 'hold_test_mode')
  assert.equal(decideFollowup(false, false), 'send')
  assert.equal(decideFollowup(false, true), 'send')
})

test('test account matching is case insensitive and ignores blanks', () => {
  const list = ' tester@example.com , ,Other@Example.com'
  assert.equal(isTestAccountEmail('TESTER@example.com', list), true)
  assert.equal(isTestAccountEmail('other@example.com', list), true)
  assert.equal(isTestAccountEmail('someone@example.com', list), false)
  assert.equal(isTestAccountEmail('tester@example.com', undefined), false)
})

test('the outcome link carries the token and no double slash', () => {
  assert.equal(buildOutcomeUrl('https://myrecruitercheck.com/', TOKEN), `https://myrecruitercheck.com/outcome?token=${TOKEN}`)
  assert.equal(buildOutcomeUrl('https://myrecruitercheck.com', TOKEN), `https://myrecruitercheck.com/outcome?token=${TOKEN}`)
})

test('the email names the role, links the form and offers a way to stop', () => {
  const url = buildOutcomeUrl('https://myrecruitercheck.com', TOKEN)
  const email = buildOutcomeFollowupEmail({ jobTitle: 'Data Analyst', outcomeUrl: url })
  assert.equal(email.subject, 'How did your Data Analyst application go?')
  assert.ok(email.html.includes(url))
  assert.ok(email.text.includes(url))
  assert.ok(email.text.includes('stop asking me'))
  assert.ok(email.html.includes('Tell us how it went'))
})

test('a missing role falls back to generic wording', () => {
  const email = buildOutcomeFollowupEmail({ jobTitle: '   ', outcomeUrl: 'https://example.com/outcome?token=x' })
  assert.equal(email.subject, 'How did your application go?')
  assert.ok(!email.text.includes('application for'))
})

test('a role containing markup is escaped in the html body', () => {
  const email = buildOutcomeFollowupEmail({ jobTitle: '<b>Lead</b>', outcomeUrl: 'https://example.com/outcome?token=x' })
  assert.ok(!email.html.includes('<b>Lead</b>'))
  assert.ok(email.html.includes('&lt;b&gt;Lead&lt;/b&gt;'))
})

test('email copy contains no dashes', () => {
  const email = buildOutcomeFollowupEmail({ jobTitle: 'Engineer', outcomeUrl: 'https://example.com/outcome?token=x' })
  for (const text of [email.subject, email.text]) {
    const withoutUrls = text.replace(/https?:\/\/\S+/g, '')
    assert.ok(!/[‒–—―]| - /.test(withoutUrls), `dash found in: ${withoutUrls}`)
  }
})

// Source guards on index.ts, which cannot run under tsx (Deno.serve).
const code = readFileSync('supabase/functions/send-outcome-followups/index.ts', 'utf8')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n')

test('the service role check comes before anything else', () => {
  const guard = code.indexOf('if (!isServiceRoleRequest(req))')
  assert.ok(guard > 0)
  assert.ok(guard < code.indexOf('createClient('))
  assert.ok(guard < code.indexOf('claim_application_outcome_followups'))
})

test('rows are claimed before any email is sent', () => {
  const claim = code.indexOf("rpc('claim_application_outcome_followups'")
  const send = code.indexOf('sendTransactionalEmail(')
  assert.ok(claim > 0 && send > 0)
  assert.ok(claim < send)
})

test('held rows are released without counting an attempt', () => {
  assert.ok(code.includes('await release(false)'))
})

test('no email address, token or link is logged', () => {
  const logs = code.match(/console\.(log|error)\([^)]*\)/g) ?? []
  assert.ok(logs.length > 0)
  for (const line of logs) {
    assert.ok(!/email|token|Url|url/.test(line.replace(/\[send-outcome-followups\]/, '')), line)
  }
})

console.log(`\n${passed} tests passed`)
