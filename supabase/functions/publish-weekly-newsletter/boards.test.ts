// Run with: npx tsx supabase/functions/publish-weekly-newsletter/boards.test.ts
//
// Offline. Every function here is pure, and the fetching lives in index.ts, so
// the suite never calls a job board. Do not add a live fetch to it.
import assert from 'node:assert/strict'
import { BOARDS, REGIONS, boardUrl, isUnplaceable, regionFor, resolveRegion } from './boards.ts'
import { parseBoard, selectPostings, type FeedItem } from './logic.ts'

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

test('every region has boards and every board is well formed', () => {
  for (const region of REGIONS) {
    const boards = BOARDS[region]
    assert.ok(boards.length > 0, `${region} has no boards`)
    for (const board of boards) {
      assert.match(board.slug, /^[a-z0-9-]+$/, `${region}/${board.slug}: odd slug`)
      assert.ok(board.name.trim().length > 0, `${region}/${board.slug}: no display name`)
      assert.match(boardUrl(board), /^https:\/\//)
    }
  }
})

test('no board is listed twice', () => {
  const all = REGIONS.flatMap((r) => BOARDS[r].map((b) => b.slug))
  assert.equal(new Set(all).size, all.length, 'a slug appears in more than one region')
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

test('London is the UK, not Europe', () => {
  // The EU pattern would swallow British cities if it ran first. This asserts
  // the outcome rather than the ordering, so a reorder is caught.
  assert.equal(regionFor('London'), 'UK')
  assert.equal(regionFor('Cambridge'), 'UK')
})

test('a location naming nowhere is unplaceable; one naming a place is not', () => {
  for (const value of ['Remote', 'Global', 'Remote - Anywhere', 'Multiple Locations']) {
    assert.ok(isUnplaceable(value), `should be unplaceable: ${value}`)
  }
  for (const value of ['Tokyo, Japan', 'Remote, Poland', 'Singapore']) {
    assert.ok(!isUnplaceable(value), `should not be unplaceable: ${value}`)
  }
})

test('a role somewhere else is dropped, never filed under its board region', () => {
  // THE BUG THIS EXISTS FOR: an OpenAI role in Tokyo was labelled USA because
  // OpenAI sits on the USA list, and a Moniepoint role in Poland was labelled
  // Africa. A regional section that lies about the region has no reason to be.
  assert.equal(resolveRegion('Tokyo, Japan', 'USA'), null)
  assert.equal(resolveRegion('Remote, Poland', 'Africa'), 'EU')
  assert.equal(resolveRegion('Nairobi', 'USA'), 'Africa')

  // Only a location naming nowhere falls back to where the company is.
  assert.equal(resolveRegion('Remote', 'India'), 'India')
})

test('each platform parses to the same shape', () => {
  const gh = parseBoard({ slug: 'monzo', platform: 'greenhouse', name: 'Monzo' }, 'UK', {
    jobs: [{ title: 'Machine Learning Engineer', location: { name: 'London' }, absolute_url: 'https://x.test/1' }],
  })
  assert.deepEqual(gh, [{
    role: 'Machine Learning Engineer', company: 'Monzo', location: 'London',
    url: 'https://x.test/1', region: 'UK',
  }])

  const lever = parseBoard({ slug: 'meesho', platform: 'lever', name: 'Meesho' }, 'India', [
    { text: 'Data Engineer', categories: { location: 'Bangalore, Karnataka' }, hostedUrl: 'https://x.test/2' },
  ])
  assert.equal(lever[0].company, 'Meesho', 'Lever returns no employer, so the board supplies it')
  assert.equal(lever[0].region, 'India')

  const ashby = parseBoard({ slug: 'm-kopa', platform: 'ashby', name: 'M KOPA' }, 'Africa', {
    jobs: [{ title: 'Data Scientist', location: 'Nairobi', jobUrl: 'https://x.test/3' }],
  })
  assert.equal(ashby[0].region, 'Africa')
})

test('a board that changes shape yields nothing rather than throwing', () => {
  const board = { slug: 'x', platform: 'greenhouse' as const, name: 'X' }
  for (const payload of [null, undefined, {}, { jobs: 'nope' }, { jobs: [null, 7, 'x'] }]) {
    assert.deepEqual(parseBoard(board, 'UK', payload), [])
  }
})

test('board postings get the same hygiene as feed postings', () => {
  // Not a separate, looser path: dashes would fail validateIssue at render
  // time, and an apprenticeship is wrong for this audience whatever its title.
  const board = { slug: 'x', platform: 'greenhouse' as const, name: 'X' }
  const dashed = parseBoard(board, 'UK', {
    jobs: [{ title: 'Senior ML Engineer - Platform', location: { name: 'London' }, absolute_url: 'https://x.test/1' }],
  })
  assert.ok(!/[-–—]/.test(dashed[0].role), `dash survived: ${dashed[0].role}`)

  const intern = parseBoard(board, 'UK', {
    jobs: [{ title: 'Software Engineer Internship', location: { name: 'London' }, absolute_url: 'https://x.test/2' }],
  })
  assert.deepEqual(intern, [])

  const insecure = parseBoard(board, 'UK', {
    jobs: [{ title: 'Data Scientist', location: { name: 'London' }, absolute_url: 'http://x.test/3' }],
  })
  assert.deepEqual(insecure, [])
})

const item = (over: Partial<FeedItem> = {}): FeedItem => ({
  role: 'Machine Learning Engineer',
  company: 'An employer',
  location: 'Somewhere',
  url: 'https://x.test/1',
  region: null,
  ...over,
})

test('the five slots go to the five regions', () => {
  const pool = REGIONS.flatMap((region, i) => [
    item({ region, company: `${region} A`, url: `https://x.test/${region}-a` }),
    item({ region, company: `${region} B`, url: `https://x.test/${region}-b-${i}` }),
  ])
  const chosen = selectPostings(pool, [])
  assert.deepEqual(chosen.map((c) => c.region), [...REGIONS])
})

test('a region with nothing costs its slot, not the issue', () => {
  // Africa and India routinely return nothing from the open feeds. Failing the
  // week over an empty region would mean no issue at all rather than a weaker
  // one, so the leftover slots are filled from anywhere.
  const pool = [
    item({ region: 'EU', company: 'A', url: 'https://x.test/a' }),
    item({ region: 'UK', company: 'B', url: 'https://x.test/b' }),
    item({ region: 'EU', company: 'C', url: 'https://x.test/c' }),
    item({ region: null, company: 'D', url: 'https://x.test/d' }),
    item({ region: 'UK', company: 'E', url: 'https://x.test/e' }),
  ]
  const chosen = selectPostings(pool, [])
  assert.equal(chosen.length, 5, 'the issue must still get five postings')
  assert.deepEqual(chosen.slice(0, 2).map((c) => c.region), ['EU', 'UK'], 'regions are served first')
})

test('one company still cannot take two slots, regional pass included', () => {
  const pool = [
    item({ region: 'EU', company: 'Same', url: 'https://x.test/1' }),
    item({ region: 'UK', company: 'Same', url: 'https://x.test/2' }),
    item({ region: 'USA', company: 'Other', url: 'https://x.test/3' }),
  ]
  assert.deepEqual(selectPostings(pool, []).map((c) => c.company), ['Same', 'Other'])
})

test('a role already sent is skipped even when it is the only one for its region', () => {
  const pool = [
    item({ region: 'Africa', company: 'A', url: 'https://x.test/old' }),
    item({ region: 'EU', company: 'B', url: 'https://x.test/new' }),
  ]
  const chosen = selectPostings(pool, ['https://x.test/old'])
  assert.deepEqual(chosen.map((c) => c.url), ['https://x.test/new'])
})

test('a role about the technology but not in it is refused', () => {
  // A dry run picked "Senior AI Governance Counsel" for the week's five: a
  // lawyer's job, ranked top because ' ai ' is a strong term. The reader is
  // looking for engineering, so these rank out of eligibility entirely.
  const refused = [
    'Senior AI Governance Counsel',
    'Account Executive, AI Platform',
    'Machine Learning Sales Engineer',
    'Technical Recruiter, Data Science',
    'Marketing Manager, AI Products',
  ].map((role) => item({ role, region: 'EU', url: `https://x.test/${role}` }))

  assert.deepEqual(selectPostings(refused, []), [])

  // And the genuine roles that sit near them still pass.
  for (const role of ['Data Scientist (Fraud)', 'Applied AI Architect', 'Machine Learning Engineer']) {
    assert.equal(selectPostings([item({ role, region: 'EU' })], []).length, 1, `should pass: ${role}`)
  }
})

console.log(`\n${passed} tests passed`)
