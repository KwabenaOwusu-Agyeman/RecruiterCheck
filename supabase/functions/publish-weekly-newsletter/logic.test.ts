// Run with: npx tsx supabase/functions/publish-weekly-newsletter/logic.test.ts
import assert from 'node:assert/strict'
import {
  REJECTION_ANGLES,
  REQUIRED_POSTINGS,
  absolutise,
  angleForWeek,
  buildCampaignPayload,
  buildGenerationRequestBody,
  buildPieceSource,
  imagesForWeek,
  isoWeek,
  nextMondayNineAm,
  normaliseText,
  parseArbeitnow,
  parseGeneration,
  parseRemotive,
  periodLabel,
  selectPostings,
  toPostings,
  type FeedItem,
} from './logic.ts'
import { loadPiece } from '../_shared/newsletter/piece.ts'

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

const item = (over: Partial<FeedItem> = {}): FeedItem => ({
  role: 'Machine Learning Engineer',
  company: 'An employer',
  location: 'Amsterdam',
  url: 'https://example.com/a-role',
  ...over,
})

// --- feed parsing ----------------------------------------------------------

test('a Remotive payload becomes items', () => {
  const items = parseRemotive({
    jobs: [{
      title: 'Machine Learning Engineer',
      company_name: 'An employer',
      candidate_required_location: 'Europe',
      url: 'https://remotive.com/x',
    }],
  })
  assert.deepEqual(items, [{
    role: 'Machine Learning Engineer', company: 'An employer',
    location: 'Europe', url: 'https://remotive.com/x',
  }])
})

test('an Arbeitnow payload becomes items', () => {
  const items = parseArbeitnow({
    data: [{ title: 'Data Engineer', company_name: 'Another', location: 'Berlin', url: 'https://arbeitnow.com/y' }],
  })
  assert.equal(items.length, 1)
  assert.equal(items[0].role, 'Data Engineer')
})

test('a feed that changes shape yields nothing rather than throwing', () => {
  // Third party JSON. A job board restructuring should cost us an issue, not
  // produce one with the word undefined in it.
  for (const payload of [null, undefined, {}, { jobs: 'nope' }, { jobs: [null, 7, 'x'] }]) {
    assert.deepEqual(parseRemotive(payload), [])
  }
  assert.deepEqual(parseArbeitnow({ data: [{ title: 'Only a title' }] }), [])
})

test('a posting without an https link is dropped at parse time', () => {
  // validateIssue would refuse it later and fail the whole issue. Losing one
  // posting is the cheaper failure.
  const items = parseRemotive({
    jobs: [
      { title: 'A', company_name: 'B', url: 'http://insecure.test/x' },
      { title: 'C', company_name: 'D', url: 'javascript:alert(1)' },
      { title: 'E', company_name: 'F', url: 'https://ok.test/x' },
    ],
  })
  assert.deepEqual(items.map((i) => i.url), ['https://ok.test/x'])
})

test('a missing location falls back rather than rendering empty', () => {
  const items = parseArbeitnow({ data: [{ title: 'A', company_name: 'B', url: 'https://x.test/1' }] })
  assert.equal(items[0].location, 'Remote')
})

test('a real job title survives the dash rule', () => {
  // The bug this exists for: CLAUDE.md forbids dashes in user facing copy and
  // validateIssue enforces that on postings[i].role. Real titles are full of
  // them, so without normalisation EVERY week would fail to render. Caught by
  // running against the live feeds; invented fixtures all had clean titles.
  assert.equal(
    normaliseText('Lead Data Engineer - Data Platform & AI'),
    'Lead Data Engineer, Data Platform & AI',
  )
  assert.equal(normaliseText('Full-Stack Developer'), 'Full Stack Developer')
  assert.equal(normaliseText('AI Engineer – Marketing'), 'AI Engineer, Marketing')
})

test('gender boilerplate is dropped', () => {
  // Noise in an English newsletter, and five of them cost real budget.
  assert.equal(normaliseText('AI Developer (m/w/d)'), 'AI Developer')
  assert.equal(normaliseText('Data Scientist (w/m/d)'), 'Data Scientist')
  assert.equal(normaliseText('Engineer (all genders)'), 'Engineer')
})

test('an over-long title is cut at a separator, not mid phrase', () => {
  const long = 'AI Automation Engineer – Marketing & Operations Consulting (m/w/d) in Stuttgart, Hamburg oder Berlin – Hybrid'
  const out = normaliseText(long)
  assert.ok(out.length <= 70, `still ${out.length} chars: ${out}`)
  // Cut at the last separator that fits, so the location survives.
  assert.equal(out, 'AI Automation Engineer, Marketing & Operations Consulting in Stuttgart')
  assert.ok(!/[-‐-―]/.test(out))
})

test('normalised text never ends on a comma or a stray space', () => {
  for (const input of ['Engineer -', '- Engineer', 'Engineer (m/w/d) ', 'A  -  B']) {
    const out = normaliseText(input)
    assert.ok(!/^[\s,]|[\s,]$/.test(out), `ragged: "${out}"`)
  }
})

test('student and internship postings are dropped, not just ranked down', () => {
  // Wrong audience whatever the title says: this goes to people applying for
  // jobs, and Arbeitnow carries a lot of Werkstudent listings.
  const items = parseArbeitnow({
    data: [
      { title: 'Werkstudent AI Engineering', company_name: 'C', url: 'https://x.test/1' },
      { title: 'Praktikum Data Science', company_name: 'C', url: 'https://x.test/2' },
      { title: 'Machine Learning Engineer', company_name: 'C', url: 'https://x.test/3' },
    ],
  })
  assert.deepEqual(items.map((i) => i.role), ['Machine Learning Engineer'])
})

// --- selection -------------------------------------------------------------

test('five are chosen, AI roles ahead of generic ones', () => {
  const items = [
    item({ role: 'Frontend Developer', company: 'C1', url: 'https://x.test/1' }),
    item({ role: 'Machine Learning Engineer', company: 'C2', url: 'https://x.test/2' }),
    item({ role: 'Backend Engineer', company: 'C3', url: 'https://x.test/3' }),
    item({ role: 'Data Scientist', company: 'C4', url: 'https://x.test/4' }),
    item({ role: 'DevOps Engineer', company: 'C5', url: 'https://x.test/5' }),
    item({ role: 'LLM Engineer', company: 'C6', url: 'https://x.test/6' }),
  ]
  const chosen = selectPostings(items, [])
  assert.equal(chosen.length, REQUIRED_POSTINGS)
  assert.deepEqual(chosen.slice(0, 3).map((c) => c.role),
    ['Machine Learning Engineer', 'Data Scientist', 'LLM Engineer'])
})

test('a role sent in a recent issue is not sent again', () => {
  // Repeating a role a subscriber saw last month reads as a broken feed, and
  // is the most likely way this job embarrasses itself.
  const items = [
    item({ company: 'C1', url: 'https://x.test/old' }),
    item({ company: 'C2', url: 'https://x.test/new' }),
  ]
  const chosen = selectPostings(items, ['https://x.test/old'])
  assert.deepEqual(chosen.map((c) => c.url), ['https://x.test/new'])
})

test('one role per company', () => {
  // Five openings at one employer is that employer's careers page.
  const items = [
    item({ company: 'Same', url: 'https://x.test/1' }),
    item({ company: 'SAME', url: 'https://x.test/2' }),
    item({ company: 'Other', url: 'https://x.test/3' }),
  ]
  assert.deepEqual(selectPostings(items, []).map((c) => c.company), ['Same', 'Other'])
})

test('roles that are not AI or tech are excluded entirely', () => {
  const items = [
    item({ role: 'Warehouse Operative', company: 'C1', url: 'https://x.test/1' }),
    item({ role: 'Chair of Retail Detail', company: 'C2', url: 'https://x.test/2' }),
  ]
  // "Chair" and "Detail" both contain the letters ai; the term is padded so
  // neither matches.
  assert.deepEqual(selectPostings(items, []), [])
})

test('selection is stable, so the same feed builds the same issue', () => {
  const items = Array.from({ length: 9 }, (_, i) =>
    item({ role: 'Backend Engineer', company: `C${i}`, url: `https://x.test/${i}` }))
  assert.deepEqual(selectPostings(items, []), selectPostings(items, []))
})

// --- the rejection angle ---------------------------------------------------

test('the angle rotates and every angle is reachable', () => {
  const seen = new Set(Array.from({ length: REJECTION_ANGLES.length }, (_, w) => angleForWeek(w + 1)))
  assert.equal(seen.size, REJECTION_ANGLES.length)
  assert.equal(angleForWeek(1), angleForWeek(1 + REJECTION_ANGLES.length))
})

test('no angle offers a fix, and none contains a dash', () => {
  // Section two is the pain and nothing else: the product is the resolution
  // and it sits in the call to action. And a dash here would fail every render
  // that used it, so it is cheaper to assert than to discover on a Monday.
  for (const angle of REJECTION_ANGLES) {
    assert.ok(!/[-‐-―]/.test(angle), `dash in: ${angle}`)
    assert.ok(!/\b(instead|you should|try to|make sure|tip:)\b/i.test(angle), `advice in: ${angle}`)
  }
})

test('images rotate and always carry alt text', () => {
  for (const week of [1, 2, 3, 4]) {
    const pair = imagesForWeek(week)
    for (const image of [pair.rejection, pair.trends]) {
      assert.match(image.url, /^\/newsletter\/[\w.-]+$/)
      assert.ok(image.alt.length > 10)
    }
  }
  assert.notEqual(imagesForWeek(1).rejection.url, imagesForWeek(2).rejection.url)
})

// --- dates -----------------------------------------------------------------

/**
 * What the clock in Amsterdam reads at a given instant, assembled from parts
 * rather than from a formatted string: locale punctuation between the weekday
 * and the time varies by ICU build, and that is not what these tests are about.
 */
function amsterdam(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(at).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value
    return acc
  }, {})
  return `${parts.weekday} ${parts.hour}:${parts.minute}`
}

test('the send lands at 09:00 Amsterdam on Monday in summer time', () => {
  // Sunday 18 October 2026, still CEST.
  const at = nextMondayNineAm(new Date('2026-10-18T06:00:00Z'))
  assert.equal(amsterdam(at), 'Mon 09:00')
  assert.equal(at.toISOString(), '2026-10-19T07:00:00.000Z')
})

test('and at 09:00 Amsterdam on Monday after the clocks change', () => {
  // EU summer time ends Sunday 25 October 2026. The job runs that morning, in
  // CEST, and schedules into CET. Assuming a fixed plus two would send it an
  // hour early; assuming plus one would have been an hour early the week
  // before. The offset is derived at the target instant for this reason.
  const at = nextMondayNineAm(new Date('2026-10-25T06:00:00Z'))
  assert.equal(amsterdam(at), 'Mon 09:00')
  assert.equal(at.toISOString(), '2026-10-26T08:00:00.000Z')
})

test('Monday schedules a week out, never the same morning', () => {
  const at = nextMondayNineAm(new Date('2026-09-07T06:00:00Z'))
  assert.equal(amsterdam(at), 'Mon 09:00')
  assert.ok(at.getTime() - Date.parse('2026-09-07T06:00:00Z') > 6 * 86400000)
})

test('the ISO week is the week-numbering one, not the calendar year', () => {
  assert.deepEqual(isoWeek(new Date('2026-09-07T00:00:00Z')), { year: 2026, week: 37 })
  // 1 January 2027 is a Friday, so it belongs to week 53 of 2026.
  assert.deepEqual(isoWeek(new Date('2027-01-01T00:00:00Z')), { year: 2026, week: 53 })
})

test('the period label reads as a month', () => {
  assert.equal(periodLabel(new Date('2026-09-07T12:00:00Z')), 'September 2026')
})

// --- generation ------------------------------------------------------------

test('the prompt states the copy rules and pins the schema', () => {
  const body = buildGenerationRequestBody([item()], 'An angle.', [], null) as {
    response_format: { json_schema: { strict: boolean; schema: { additionalProperties: boolean } } }
    messages: Array<{ content: string }>
  }
  const prompt = body.messages.map((m) => m.content).join('\n')
  assert.match(prompt, /Never use a dash/)
  assert.match(prompt, /do not offer a fix/)
  assert.match(prompt, /An angle\./)
  assert.equal(body.response_format.json_schema.strict, true)
  assert.equal(body.response_format.json_schema.schema.additionalProperties, false)
})

test('a retry carries the complaint, a first attempt does not', () => {
  const first = JSON.stringify(buildGenerationRequestBody([item()], 'A', [], null))
  const retry = JSON.stringify(buildGenerationRequestBody([item()], 'A', [], 'intro contains a dash'))
  assert.ok(!first.includes('previous response was rejected'))
  assert.ok(retry.includes('intro contains a dash'))
})

test('recent headings are passed so the same pain is not repeated', () => {
  const body = JSON.stringify(buildGenerationRequestBody([item()], 'A', ['You were rejected in eleven seconds'], null))
  assert.ok(body.includes('You were rejected in eleven seconds'))
  assert.ok(body.includes('Do not repeat'))
})

test('an incomplete generation is refused, not patched', () => {
  const good = { subject: 'S', intro: 'I', postingNotes: ['a', 'b'], rejection: { heading: 'H', body: 'B' }, trends: { heading: 'H', body: 'B' } }
  assert.equal(parseGeneration(good, 2).subject, 'S')

  assert.throws(() => parseGeneration({ ...good, subject: '  ' }, 2), /subject/)
  assert.throws(() => parseGeneration({ ...good, postingNotes: ['a'] }, 2), /postingNotes/)
  assert.throws(() => parseGeneration({ ...good, trends: { heading: 'H', body: '' } }, 2), /trends/)
  assert.throws(() => parseGeneration(null, 2), /incomplete/)
})

test('a link in generated copy is refused, whatever asked for it', () => {
  // Prompt injection. Role and company names come from public feeds, are
  // chosen by whoever posted the advert, and reach the prompt. HTML is already
  // escaped by piece.ts and the length is already capped, but renderInline
  // supports markdown links for authored pieces, so a link is the one payload
  // that would otherwise reach an inbox. Generated copy never needs one.
  const good = { subject: 'S', intro: 'I', postingNotes: ['a'], rejection: { heading: 'H', body: 'B' }, trends: { heading: 'H', body: 'B' } }

  for (const payload of [
    { ...good, trends: { heading: 'H', body: 'Read [more](https://evil.test)' } },
    { ...good, intro: 'Visit https://evil.test now' },
    { ...good, subject: 'See www.evil.test' },
    { ...good, postingNotes: ['<a href="https://evil.test">x</a>'] },
    { ...good, rejection: { heading: 'Go to http://evil.test', body: 'B' } },
  ]) {
    assert.throws(() => parseGeneration(payload, 1), /contains a link/)
  }

  assert.doesNotThrow(() => parseGeneration(good, 1))
})

test('generated prose goes through the same loader as an authored piece', () => {
  // The whole point of rebuilding the markdown: piece.ts already refuses
  // dashes, headings and raw HTML, and escapes before producing markup. The
  // model gets held to the identical standard, with no second implementation
  // of the rules to drift out of step.
  const image = { url: '/newsletter/connected-data.jpg', alt: 'An abstract network of cubes' }

  const ok = loadPiece('trends', buildPieceSource('A heading', image, 'One paragraph.\n\nAnd a second.'))
  assert.deepEqual(ok.problems, [])
  assert.equal(ok.piece?.html, '<p>One paragraph.</p><p>And a second.</p>')

  const dashed = loadPiece('trends', buildPieceSource('A heading', image, 'Takes 2-3 minutes.'))
  assert.ok(dashed.problems.some((p) => p.includes('dash')))

  const injected = loadPiece('trends', buildPieceSource('A heading', image, '<script>alert(1)</script>'))
  assert.ok(!injected.piece?.html.includes('<script>'))
})

test('notes are attached to postings in order', () => {
  const postings = toPostings([item({ role: 'A' }), item({ role: 'B' })], ['first', 'second'])
  assert.deepEqual(postings.map((p) => [p.role, p.note]), [['A', 'first'], ['B', 'second']])
})

test('an image path is absolutised, an absolute URL is left alone', () => {
  assert.equal(absolutise('/newsletter/a.jpg'), 'https://myrecruitercheck.com/newsletter/a.jpg')
  assert.equal(absolutise('https://cdn.test/a.jpg'), 'https://cdn.test/a.jpg')
})

// --- the campaign ----------------------------------------------------------

test('the campaign is scheduled, never sent outright', () => {
  // scheduledAt is what makes an unattended send recoverable: the issue goes
  // out with nobody doing anything, and a bad week can still be cancelled in
  // Brevo before it reaches an inbox.
  const scheduledAt = new Date('2026-09-14T07:00:00Z')
  const payload = buildCampaignPayload({
    year: 2026, week: 37, subject: 'S', html: '<p>x</p>', listId: 4,
    scheduledAt, senderName: 'MyRecruiterCheck', senderEmail: 'notifications@myrecruitercheck.com',
  }) as Record<string, unknown>

  assert.equal(payload.scheduledAt, '2026-09-14T07:00:00.000Z')
  assert.equal(payload.type, 'classic')
  assert.deepEqual(payload.recipients, { listIds: [4] })
  assert.equal(payload.name, 'Weekly newsletter 2026 week 37')
})

test('a reply-to is included only when one is configured', () => {
  const base = {
    year: 2026, week: 37, subject: 'S', html: '<p>x</p>', listId: 4,
    scheduledAt: new Date('2026-09-14T07:00:00Z'),
    senderName: 'N', senderEmail: 'a@b.test',
  }
  assert.ok(!('replyTo' in buildCampaignPayload(base)))
  assert.equal((buildCampaignPayload({ ...base, replyTo: 'r@b.test' }) as { replyTo: string }).replyTo, 'r@b.test')
})

console.log(`\n${passed} tests passed`)
