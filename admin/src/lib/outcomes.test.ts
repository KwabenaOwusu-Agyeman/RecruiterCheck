// Run with: npx tsx admin/src/lib/outcomes.test.ts
import assert from 'node:assert/strict'
import { MIN_GROUP_SIZE, scoreBand, summariseOutcomes, type OutcomeRow } from './outcomes'

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

const T = '2026-09-10T09:00:00.000Z'

function row(overrides: Partial<OutcomeRow>): OutcomeRow {
  return {
    responded_at: null,
    withdrawn_at: null,
    followup_sent_at: null,
    applied: null,
    channel: null,
    stage: null,
    days_to_reply: null,
    salary_offered: null,
    salary_currency: null,
    salary_country: null,
    score: null,
    job_title: null,
    ...overrides,
  }
}

function answeredRow(overrides: Partial<OutcomeRow>): OutcomeRow {
  return row({ followup_sent_at: T, responded_at: T, applied: true, channel: 'job_board', ...overrides })
}

test('score bands cover the range without gaps', () => {
  assert.equal(scoreBand(null), null)
  assert.equal(scoreBand(0), 'Below 40')
  assert.equal(scoreBand(39.9), 'Below 40')
  assert.equal(scoreBand(40), '40 to 59')
  assert.equal(scoreBand(59), '40 to 59')
  assert.equal(scoreBand(60), '60 to 79')
  assert.equal(scoreBand(80), '80 and above')
  assert.equal(scoreBand(100), '80 and above')
})

test('an empty table reports rates as unavailable, not zero', () => {
  const out = summariseOutcomes([])
  assert.deepEqual(out.optedIn, { available: true, value: 0 })
  assert.equal(out.responseRate.available, false)
  assert.equal(out.interviewRate.available, false)
  assert.equal(out.medianDaysToReply.available, false)
  assert.deepEqual(out.byStage, [])
})

test('funnel counts and rates', () => {
  const rows = [
    row({}),
    row({ followup_sent_at: T }),
    row({ followup_sent_at: T, withdrawn_at: T }),
    row({ followup_sent_at: T, responded_at: T, applied: false }),
    answeredRow({ stage: 'no_reply' }),
    answeredRow({ stage: 'interview', days_to_reply: 4 }),
    answeredRow({ stage: 'offer', days_to_reply: 10 }),
    answeredRow({ stage: 'rejected', days_to_reply: 7 }),
  ]
  const out = summariseOutcomes(rows)
  assert.deepEqual(out.optedIn, { available: true, value: 8 })
  assert.deepEqual(out.emailed, { available: true, value: 7 })
  assert.deepEqual(out.answered, { available: true, value: 5 })
  assert.deepEqual(out.withdrawn, { available: true, value: 1 })
  assert.deepEqual(out.responseRate, { available: true, value: (5 / 7) * 100 })
  assert.deepEqual(out.appliedRate, { available: true, value: 80 })
  assert.deepEqual(out.interviewRate, { available: true, value: 50 })
  assert.deepEqual(out.ghostRate, { available: true, value: 25 })
  assert.deepEqual(out.medianDaysToReply, { available: true, value: 7 })
  assert.equal(out.byStage.length, 4)
})

test('a score band with too few answers hides its interview rate', () => {
  const few = Array.from({ length: MIN_GROUP_SIZE - 1 }, () => answeredRow({ stage: 'interview', score: 85 }))
  const enough = Array.from({ length: MIN_GROUP_SIZE }, (_, i) =>
    answeredRow({ stage: i < 2 ? 'offer' : 'rejected', score: 50 }),
  )
  const out = summariseOutcomes([...few, ...enough])
  const high = out.byScoreBand.find((b) => b.band === '80 and above')!
  const mid = out.byScoreBand.find((b) => b.band === '40 to 59')!
  assert.equal(high.applied, MIN_GROUP_SIZE - 1)
  assert.equal(high.interviews.available, false)
  assert.deepEqual(mid.interviews, { available: true, value: 40 })
})

test('salary groups under the minimum size are hidden and counted', () => {
  const offer = (salary: number, title: string, country = 'NL') =>
    answeredRow({ stage: 'offer', salary_offered: salary, salary_currency: 'EUR', salary_country: country, job_title: title })
  const rows = [
    ...[50000, 52000, 54000, 56000, 58000].map((s) => offer(s, ' Data  Analyst ')),
    offer(90000, 'data analyst', 'GB'),
    offer(70000, 'Engineer'),
  ]
  const out = summariseOutcomes(rows)
  assert.equal(out.salaries.length, 1)
  assert.deepEqual(out.salaries[0], { role: 'data analyst', country: 'NL', currency: 'EUR', offers: 5, median: 54000 })
  assert.equal(out.salaryGroupsHidden, 2)
})

test('salary on a non offer row is ignored', () => {
  const rows = Array.from({ length: MIN_GROUP_SIZE }, () =>
    answeredRow({ stage: 'interview', salary_offered: 50000, salary_currency: 'EUR', salary_country: 'NL' }),
  )
  assert.deepEqual(summariseOutcomes(rows).salaries, [])
})

test('labels shown on the page contain no dashes', () => {
  const out = summariseOutcomes([answeredRow({ stage: 'no_reply', channel: 'company_site', score: 50 })])
  const labels = [...out.byStage, ...out.byChannel].map((s) => s.label).concat(out.byScoreBand.map((b) => b.band))
  for (const label of labels) assert.ok(!/[‒–—―-]/.test(label), label)
})

console.log(`\n${passed} tests passed`)
