// Run with: npx tsx scripts/newsletter/postings.test.ts
//
// Offline. Every function under test is pure, and the fetching is deliberately
// kept out of them, so the suite never touches a job board.
import assert from 'node:assert/strict'
import {
  boardUrl,
  isTechRole,
  isUnplaceable,
  jobsFromPayload,
  normalise,
  regionFor,
  resolveRegion,
  shortlist,
  tidyLocation,
  type Board,
  type Candidate,
} from './postings.ts'

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

test('a tech role is recognised across the wordings boards use', () => {
  for (const title of [
    'Senior Site Reliability Engineer',
    'Software Engineer, Host Assurance',
    'Machine Learning Engineer',
    'Data Scientist',
    'Data Engineer',
    'DevOps Engineer',
    'Backend Developer',
    'Research Scientist, Alignment',
  ]) {
    assert.ok(isTechRole(title), `should be a tech role: ${title}`)
  }
})

test('the titles that made the first version look sloppy are refused', () => {
  // Every one of these was returned by a loose keyword match against real
  // boards. They are the reason there is an exclusion pass at all.
  for (const title of [
    'Account Executive, AI Native',
    'Strategic Finance Analyst',
    'Cluster Head (Security & Investigation)',
    'Stock Controller - Wa',
    'Sr. Manager, Field Engineering - Healthcare and Life Sciences',
    'Senior Solutions Engineer',
    'Technical Recruiter, Engineering',
    'Software Engineering Intern',
  ]) {
    assert.ok(!isTechRole(title), `should be refused: ${title}`)
  }
})

test('a location names its region', () => {
  assert.equal(regionFor('London'), 'UK')
  assert.equal(regionFor('UK - London'), 'UK')
  assert.equal(regionFor('Paris, France'), 'EU')
  assert.equal(regionFor('Remote, Poland'), 'EU')
  assert.equal(regionFor('Zürich, CH'), 'EU')
  assert.equal(regionFor('Nairobi'), 'Africa')
  assert.equal(regionFor('Rukanga, Kenya'), 'Africa')
  assert.equal(regionFor('Bengaluru'), 'India')
  assert.equal(regionFor('San Francisco'), 'USA')
  assert.equal(regionFor('Tokyo, Japan'), null)
})

test('London is the UK and not Europe', () => {
  // The EU pattern would match plenty of British locations if it ran first.
  // Order is load bearing, so this asserts the outcome rather than the order.
  assert.equal(regionFor('London'), 'UK')
  assert.equal(regionFor('Cambridge'), 'UK')
})

test('a location naming nowhere is unplaceable, one naming a place is not', () => {
  for (const value of ['Remote', 'remote', 'Global', 'Remote - Anywhere', 'Location not stated', 'Multiple Locations']) {
    assert.ok(isUnplaceable(value), `should be unplaceable: ${value}`)
  }
  for (const value of ['Tokyo, Japan', 'Remote, Poland', 'São Paulo', 'Singapore']) {
    assert.ok(!isUnplaceable(value), `should not be unplaceable: ${value}`)
  }
})

test('a role somewhere else is dropped, not filed under the board region', () => {
  // THE BUG THIS EXISTS FOR: an OpenAI role in Tokyo was labelled USA because
  // OpenAI sits on the USA list. A regional section that lies about the region
  // has no reason to exist.
  assert.equal(resolveRegion('Tokyo, Japan', 'USA'), null)
  assert.equal(resolveRegion('Singapore', 'India'), null)

  // Unplaceable falls back to the board, which is where the company is.
  assert.equal(resolveRegion('Remote', 'USA'), 'USA')

  // A named location always wins over the board's list.
  assert.equal(resolveRegion('Remote, Poland', 'Africa'), 'EU')
  assert.equal(resolveRegion('Nairobi', 'USA'), 'Africa')
})

test('each platform normalises to the same shape', () => {
  const gh: Board = { slug: 'monzo', platform: 'greenhouse', name: 'Monzo' }
  const fromGh = normalise(gh, 'UK', {
    title: 'Backend Engineer',
    location: { name: 'London' },
    absolute_url: 'https://job-boards.greenhouse.io/monzo/jobs/1',
    first_published: '2026-09-01T00:00:00Z',
  })
  assert.deepEqual(fromGh, {
    region: 'UK',
    role: 'Backend Engineer',
    company: 'Monzo',
    location: 'London',
    url: 'https://job-boards.greenhouse.io/monzo/jobs/1',
    postedAt: Date.parse('2026-09-01T00:00:00Z'),
  })

  const lever: Board = { slug: 'meesho', platform: 'lever', name: 'Meesho' }
  const fromLever = normalise(lever, 'India', {
    text: 'Data Engineer',
    categories: { location: 'Bangalore, Karnataka' },
    hostedUrl: 'https://jobs.lever.co/meesho/1',
    createdAt: 1757916149833,
  })
  assert.equal(fromLever?.role, 'Data Engineer')
  assert.equal(fromLever?.region, 'India')
  assert.equal(fromLever?.postedAt, 1757916149833)

  const ashby: Board = { slug: 'm-kopa', platform: 'ashby', name: 'M KOPA' }
  const fromAshby = normalise(ashby, 'Africa', {
    title: 'Software Engineering Team Lead',
    location: 'Nairobi',
    jobUrl: 'https://jobs.ashbyhq.com/m-kopa/1',
    publishedAt: '2026-09-03T14:35:34.651+00:00',
  })
  assert.equal(fromAshby?.company, 'M KOPA')
  assert.equal(fromAshby?.location, 'Nairobi')
})

test('a posting without an https link is dropped', () => {
  // issue.ts refuses to render one, so gathering it would only waste a slot.
  const board: Board = { slug: 'x', platform: 'greenhouse', name: 'X' }
  assert.equal(normalise(board, 'UK', { title: 'Engineer', location: { name: 'London' }, absolute_url: 'http://x.test/1' }), null)
  assert.equal(normalise(board, 'UK', { title: 'Engineer', location: { name: 'London' } }), null)
})

test('an empty location reads as not stated rather than blank', () => {
  assert.equal(tidyLocation(''), 'Location not stated')
  assert.equal(tidyLocation(null), 'Location not stated')
  assert.equal(tidyLocation('  London,   UK '), 'London, UK')
})

test('each platform is read out of its own envelope', () => {
  assert.deepEqual(jobsFromPayload('lever', [{ a: 1 }]), [{ a: 1 }])
  assert.deepEqual(jobsFromPayload('greenhouse', { jobs: [{ a: 1 }] }), [{ a: 1 }])
  assert.deepEqual(jobsFromPayload('ashby', { jobs: [{ a: 1 }] }), [{ a: 1 }])
  assert.deepEqual(jobsFromPayload('greenhouse', null), [])
  assert.deepEqual(jobsFromPayload('lever', { jobs: [] }), [])
})

test('board URLs are built per platform', () => {
  assert.match(boardUrl({ slug: 'monzo', platform: 'greenhouse', name: '' }), /greenhouse\.io\/v1\/boards\/monzo\/jobs$/)
  assert.match(boardUrl({ slug: 'cred', platform: 'lever', name: '' }), /lever\.co\/v0\/postings\/cred\?mode=json$/)
  assert.match(boardUrl({ slug: 'navi', platform: 'ashby', name: '' }), /ashbyhq\.com\/posting-api\/job-board\/navi$/)
})

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  region: 'UK',
  role: 'Backend Engineer',
  company: 'Monzo',
  location: 'London',
  url: 'https://x.test/1',
  postedAt: 1_000,
  ...over,
})

test('the shortlist takes the newest and caps each region', () => {
  const picked = shortlist(
    [
      candidate({ company: 'A', postedAt: 1 }),
      candidate({ company: 'B', postedAt: 3 }),
      candidate({ company: 'C', postedAt: 2 }),
    ],
    2,
  )
  assert.equal(picked.length, 2)
  assert.deepEqual(picked.map((c) => c.company), ['B', 'C'])
})

test('one company cannot fill a region on its own', () => {
  // Databricks alone posts 870 roles. Without this the section is a single
  // employer's board rather than a shortlist.
  const picked = shortlist(
    [
      candidate({ company: 'Databricks', role: 'Engineer 1', postedAt: 9 }),
      candidate({ company: 'Databricks', role: 'Engineer 2', postedAt: 8 }),
      candidate({ company: 'Monzo', role: 'Engineer 3', postedAt: 7 }),
    ],
    3,
  )
  assert.deepEqual(picked.map((c) => c.company), ['Databricks', 'Monzo'])
})

test('the same role at the same company appears once', () => {
  const picked = shortlist([candidate({ postedAt: 2 }), candidate({ postedAt: 1 })], 5)
  assert.equal(picked.length, 1)
})

test('regions are filled independently', () => {
  const picked = shortlist(
    [candidate({ region: 'UK', company: 'A' }), candidate({ region: 'India', company: 'B' })],
    1,
  )
  assert.equal(picked.length, 2)
})

console.log(`\n${passed} tests passed`)
