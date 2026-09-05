// Run with: npx tsx admin/src/lib/redact.test.ts
import assert from 'node:assert/strict'
import { REDACTED, isDeniedKey, maskEmail, redact, safeErrorSummary } from './redact'

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

test('candidate document fields are redacted', () => {
  const out = redact({
    id: 'chk_1',
    job_description: 'Full job advert text that must never be logged',
    cv_file_name: 'Jane-Doe-CV.pdf',
    cv_storage_path: 'user-id/cv.pdf',
    status: 'completed',
  }) as Record<string, unknown>

  assert.equal(out.job_description, REDACTED)
  assert.equal(out.cv_file_name, REDACTED)
  assert.equal(out.cv_storage_path, REDACTED)
  // Operational fields survive: without them the audit log is useless.
  assert.equal(out.id, 'chk_1')
  assert.equal(out.status, 'completed')
})

test('proprietary scoring internals are redacted', () => {
  const out = redact({
    final_score: 78,
    subcriteria: { experience: { weight: 0.4 } },
    category_totals: { skills: 21 },
    rubric_version: 'v3',
    evidence_references: { a: 1 },
  }) as Record<string, unknown>

  assert.equal(out.subcriteria, REDACTED)
  assert.equal(out.category_totals, REDACTED)
  assert.equal(out.rubric_version, REDACTED)
  assert.equal(out.evidence_references, REDACTED)
  // The score itself is an operational fact and stays.
  assert.equal(out.final_score, 78)
})

test('generated feedback content is redacted', () => {
  const out = redact({ strengths: ['a'], improvements: ['b'], prospects: ['c'] }) as Record<
    string,
    unknown
  >
  assert.equal(out.strengths, REDACTED)
  assert.equal(out.improvements, REDACTED)
  assert.equal(out.prospects, REDACTED)
})

test('anything token-like or secret-like is redacted by pattern', () => {
  const out = redact({
    stripe_secret: 'sk_live_x',
    someApiKey: 'k',
    refresh_token: 't',
    MY_PASSWORD: 'p',
    normal_field: 'kept',
  }) as Record<string, unknown>

  assert.equal(out.stripe_secret, REDACTED)
  assert.equal(out.someApiKey, REDACTED)
  assert.equal(out.refresh_token, REDACTED)
  assert.equal(out.MY_PASSWORD, REDACTED)
  assert.equal(out.normal_field, 'kept')
})

test('redaction reaches nested objects and arrays', () => {
  const out = redact({
    batch: { id: 'b1', nested: { job_description: 'secret text' } },
    items: [{ cv_file_name: 'x.pdf' }],
  }) as Record<string, Record<string, Record<string, unknown>>>

  assert.equal(out.batch.nested.job_description, REDACTED)
  assert.equal((out.items as unknown as Record<string, unknown>[])[0].cv_file_name, REDACTED)
})

test('deeply nested structures stop rather than recursing forever', () => {
  type Deep = { next?: Deep; job_description?: string }
  let node: Deep = { job_description: 'deep' }
  for (let i = 0; i < 30; i += 1) node = { next: node }
  assert.doesNotThrow(() => redact(node))
})

test('a self-referencing object does not hang', () => {
  const cyclic: Record<string, unknown> = { id: 'x' }
  cyclic.self = cyclic
  assert.doesNotThrow(() => redact(cyclic))
})

test('long strings are truncated', () => {
  const out = redact({ note: 'a'.repeat(900) }) as Record<string, string>
  assert.ok(out.note.length <= 504)
  assert.ok(out.note.endsWith('...'))
})

test('isDeniedKey is case insensitive', () => {
  assert.equal(isDeniedKey('JOB_DESCRIPTION'), true)
  assert.equal(isDeniedKey('Cv_File_Name'), true)
  assert.equal(isDeniedKey('status'), false)
})

test('safeErrorSummary strips a JWT', () => {
  const summary = safeErrorSummary(
    new Error('failed with eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdef'),
  )
  assert.ok(!summary.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'))
  assert.ok(summary.includes(REDACTED))
})

test('safeErrorSummary strips Stripe secret and restricted keys', () => {
  for (const key of ['sk_live_abc123XYZ', 'sk_test_abc123', 'rk_live_abc123', 'whsec_abc123']) {
    const summary = safeErrorSummary(new Error(`stripe rejected ${key}`))
    assert.ok(!summary.includes(key), `${key} leaked`)
  }
})

test('safeErrorSummary strips a Postgres connection string', () => {
  const summary = safeErrorSummary(new Error('connect postgresql://user:pw@host:5432/db failed'))
  assert.ok(!summary.includes('user:pw'))
})

test('safeErrorSummary strips a bearer token', () => {
  const summary = safeErrorSummary(new Error('denied for Bearer abc.def.ghi'))
  assert.ok(!summary.includes('abc.def.ghi'))
})

test('safeErrorSummary never returns a stack trace and stays short', () => {
  const error = new Error('x'.repeat(900))
  const summary = safeErrorSummary(error)
  assert.ok(summary.length <= 204)
  assert.ok(!summary.includes('at Object'))
})

test('safeErrorSummary handles non-Error values', () => {
  assert.equal(safeErrorSummary('plain string'), 'plain string')
  assert.equal(safeErrorSummary(null), 'unknown_error')
  assert.equal(safeErrorSummary(undefined), 'unknown_error')
  assert.equal(safeErrorSummary({ message: 'from object' }), 'from object')
})

test('maskEmail keeps the domain and hides the local part', () => {
  // One visible head character, then one star per remaining local character:
  // 'jane' is four characters, so 'j' plus three stars.
  assert.equal(maskEmail('jane@example.com'), 'j***@example.com')
  assert.equal(maskEmail('a@b.com'), 'a*@b.com')
  assert.equal(maskEmail('not-an-email'), REDACTED)
})

console.log(`\n${passed} tests passed`)
