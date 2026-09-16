// Run with: npx tsx supabase/functions/submit-application-outcome/logic.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseRequest } from './logic.ts'

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

const token = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'

function answer(extra: Record<string, unknown>) {
  return parseRequest({ token, action: 'answer', ...extra })
}

test('a malformed or missing token is refused', () => {
  for (const bad of [undefined, '', 'abc', `${token}x`, "' or 1=1 --", 42]) {
    const out = parseRequest({ token: bad, action: 'lookup' })
    assert.equal(out.ok, false)
  }
  assert.equal(parseRequest(null).ok, false)
  assert.equal(parseRequest('text').ok, false)
})

test('lookup and withdraw need only a valid token', () => {
  assert.deepEqual(parseRequest({ token, action: 'lookup' }), { ok: true, token, action: 'lookup' })
  assert.deepEqual(parseRequest({ token: ` ${token} `, action: 'withdraw' }), { ok: true, token, action: 'withdraw' })
})

test('an unknown action is refused', () => {
  assert.equal(parseRequest({ token, action: 'delete' }).ok, false)
})

test('applied must be a boolean', () => {
  assert.equal(answer({ applied: 'yes' }).ok, false)
  assert.equal(answer({}).ok, false)
})

test('not applied clears every other field, whatever was sent', () => {
  const out = answer({ applied: false, channel: 'referral', stage: 'offer', salary_offered: 50000 })
  assert.ok(out.ok && out.action === 'answer')
  if (out.ok && out.action === 'answer') {
    assert.deepEqual(out.answer, {
      applied: false,
      channel: null,
      stage: null,
      days_to_reply: null,
      salary_offered: null,
      salary_currency: null,
      salary_country: null,
    })
  }
})

test('applied needs a known channel and stage', () => {
  assert.equal(answer({ applied: true, stage: 'interview' }).ok, false)
  assert.equal(answer({ applied: true, channel: 'linkedin', stage: 'interview' }).ok, false)
  assert.equal(answer({ applied: true, channel: 'referral' }).ok, false)
  assert.equal(answer({ applied: true, channel: 'referral', stage: 'hired' }).ok, false)
})

test('days to reply is an optional whole number up to 365', () => {
  const ok = answer({ applied: true, channel: 'job_board', stage: 'rejected', days_to_reply: '12' })
  assert.ok(ok.ok && ok.action === 'answer' && ok.answer.days_to_reply === 12)
  const empty = answer({ applied: true, channel: 'job_board', stage: 'rejected', days_to_reply: '' })
  assert.ok(empty.ok && empty.action === 'answer' && empty.answer.days_to_reply === null)
  for (const bad of [-1, 366, 2.5, 'soon']) {
    assert.equal(answer({ applied: true, channel: 'job_board', stage: 'rejected', days_to_reply: bad }).ok, false)
  }
})

test('no reply cannot carry a reply time', () => {
  assert.equal(answer({ applied: true, channel: 'job_board', stage: 'no_reply', days_to_reply: 3 }).ok, false)
})

test('salary is kept only for an offer, with currency and country', () => {
  const offer = answer({
    applied: true,
    channel: 'company_site',
    stage: 'offer',
    days_to_reply: 9,
    salary_offered: '55,000',
    salary_currency: 'eur',
    salary_country: 'nl',
  })
  assert.ok(offer.ok && offer.action === 'answer')
  if (offer.ok && offer.action === 'answer') {
    assert.equal(offer.answer.salary_offered, 55000)
    assert.equal(offer.answer.salary_currency, 'EUR')
    assert.equal(offer.answer.salary_country, 'NL')
  }

  const interview = answer({
    applied: true,
    channel: 'company_site',
    stage: 'interview',
    salary_offered: 55000,
    salary_currency: 'EUR',
    salary_country: 'NL',
  })
  assert.ok(interview.ok && interview.action === 'answer' && interview.answer.salary_offered === null)
})

test('an offer may leave salary empty', () => {
  const out = answer({ applied: true, channel: 'other', stage: 'offer', salary_offered: '' })
  assert.ok(out.ok && out.action === 'answer')
  if (out.ok && out.action === 'answer') {
    assert.equal(out.answer.salary_offered, null)
    assert.equal(out.answer.salary_currency, null)
    assert.equal(out.answer.salary_country, null)
  }
})

test('a salary without valid currency or country, or out of range, is refused', () => {
  const base = { applied: true, channel: 'other', stage: 'offer' }
  assert.equal(answer({ ...base, salary_offered: 50000, salary_country: 'NL' }).ok, false)
  assert.equal(answer({ ...base, salary_offered: 50000, salary_currency: 'EURO', salary_country: 'NL' }).ok, false)
  assert.equal(answer({ ...base, salary_offered: 50000, salary_currency: 'EUR', salary_country: 'NLD' }).ok, false)
  assert.equal(answer({ ...base, salary_offered: 0, salary_currency: 'EUR', salary_country: 'NL' }).ok, false)
  assert.equal(answer({ ...base, salary_offered: 10_000_000, salary_currency: 'EUR', salary_country: 'NL' }).ok, false)
  assert.equal(answer({ ...base, salary_offered: 'lots', salary_currency: 'EUR', salary_country: 'NL' }).ok, false)
})

// Source guards on index.ts, which cannot run under tsx (Deno.serve).
const code = readFileSync('supabase/functions/submit-application-outcome/index.ts', 'utf8')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n')

test('every row access is scoped to the token or the row it found', () => {
  assert.ok(code.includes(".eq('followup_token', parsed.token)"))
  const updates = code.match(/\.update\(/g) ?? []
  const scoped = code.match(/\.eq\('id', row\.id\)/g) ?? []
  assert.equal(updates.length, 2)
  assert.equal(scoped.length, updates.length)
})

test('an answer after withdrawal is refused before any write', () => {
  const refusal = code.indexOf('if (row.withdrawn_at)')
  const answerWrite = code.lastIndexOf('.update(')
  assert.ok(refusal > 0 && refusal < answerWrite)
})

test('lookup returns no personal data', () => {
  const lookup = code.slice(code.indexOf("parsed.action === 'lookup'"), code.indexOf("parsed.action === 'withdraw'"))
  assert.ok(!/job_title|email|salary|check_id|user_id/.test(lookup))
})

test('config.toml turns the gateway check off here and pins it on for the sender', () => {
  const config = readFileSync('supabase/config.toml', 'utf8')
  assert.ok(/\[functions\.submit-application-outcome\]\s*\nverify_jwt = false/.test(config))
  assert.ok(/\[functions\.send-outcome-followups\]\s*\nverify_jwt = true/.test(config))
})

console.log(`\n${passed} tests passed`)
