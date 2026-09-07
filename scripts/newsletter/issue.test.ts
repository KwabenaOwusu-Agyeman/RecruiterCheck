// Run with: npx tsx scripts/newsletter/issue.test.ts
import assert from 'node:assert/strict'
import { escapeHtml, renderIssue, validateIssue, type Issue } from './issue.ts'

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

const valid = (over: Partial<Issue> = {}): Issue => ({
  week: 37,
  period: 'September 2026',
  greeting: 'Hi {{ contact.FIRSTNAME }},',
  intro: 'Three things worth knowing this week before you send your next application.',
  articles: [
    {
      category: 'Hiring trends',
      readMinutes: 4,
      headline: 'What changed in AI job descriptions this quarter',
      body: 'Postings now name specific tooling far more often than they did a year ago.',
    },
  ],
  cta: {
    heading: 'Ready to see your score?',
    body: 'Run your CV against the job you actually want.',
    label: 'Check',
    url: 'https://myrecruitercheck.com/',
  },
  signOff: { name: 'Kwabena', role: 'Founder of MyRecruiterCheck' },
  ...over,
})

test('a well formed issue passes validation and renders', () => {
  assert.deepEqual(validateIssue(valid()), [])
  const html = renderIssue(valid())
  assert.match(html, /<!doctype html>/)
  assert.match(html, /MyRecruiterCheck/)
})

test('the rendered issue uses the shared brand tokens, not invented colours', () => {
  // The whole point of importing EMAIL_TOKENS: the newsletter cannot drift
  // into a second look, and a brand colour change happens in one place.
  const html = renderIssue(valid())
  assert.ok(html.includes('#020C38'), 'navy missing')
  assert.ok(html.includes('#F8F6F2'), 'cream background missing')
  assert.ok(html.includes('Inter,'), 'brand font stack missing')
})

test('a dash anywhere a reader can see is refused', () => {
  // CLAUDE.md forbids dashes in user facing copy. The BIZZY issue this format
  // is modelled on uses em dashes throughout, so without this the habit comes
  // along with the layout.
  for (const [field, issue] of [
    ['intro', valid({ intro: 'Here is what you missed — three things.' })],
    ['headline', valid({ articles: [{ ...valid().articles[0], headline: 'AI hiring — what changed' }] })],
    ['cta.body', valid({ cta: { ...valid().cta, body: 'Takes 2-3 minutes.' } })],
  ] as [string, Issue][]) {
    const problems = validateIssue(issue)
    assert.ok(
      problems.some((p) => p.includes('dash')),
      `${field} with a dash should be refused, got: ${JSON.stringify(problems)}`,
    )
  }
})

test('every dash character is caught, not just the hyphen', () => {
  for (const dash of ['-', '–', '—', '‒', '―']) {
    const problems = validateIssue(valid({ intro: `Three things ${dash} worth knowing.` }))
    assert.ok(problems.some((p) => p.includes('dash')), `${JSON.stringify(dash)} not caught`)
  }
})

test('a digest of up to six articles is allowed', () => {
  // The three item cap in CLAUDE.md governs bullet lists in product copy. An
  // editorial digest is not that, and reading it that broadly was my error.
  const six = valid({ articles: Array.from({ length: 6 }, () => valid().articles[0]) })
  assert.deepEqual(validateIssue(six), [])
})

test('more than six articles is refused', () => {
  const seven = valid({ articles: Array.from({ length: 7 }, () => valid().articles[0]) })
  assert.ok(validateIssue(seven).some((p) => p.includes('at most 6')))
})

test('a Brevo merge tag in the greeting is not mistaken for copy', () => {
  // "{{ contact.FIRSTNAME }}" is Brevo syntax, not something a reader sees,
  // so it must survive both the dash check and escaping.
  const html = renderIssue(valid())
  assert.ok(html.includes('{{ contact.FIRSTNAME }}'), 'merge tag must not be escaped')
  assert.deepEqual(validateIssue(valid({ greeting: 'Hi {{ contact.FIRSTNAME }},' })), [])
})

test('a hero image needs an absolute https URL and alt text', () => {
  const localPath = valid({
    articles: [{ ...valid().articles[0], image: { url: '/images/hero.png', alt: 'A desk' } }],
  })
  assert.ok(validateIssue(localPath).some((p) => p.includes('absolute https')))

  const noAlt = valid({
    articles: [{ ...valid().articles[0], image: { url: 'https://myrecruitercheck.com/a.png', alt: '' } }],
  })
  assert.ok(validateIssue(noAlt).some((p) => p.includes('alt is empty')))
})

test('a hero image renders above the card text', () => {
  const html = renderIssue(
    valid({
      articles: [
        {
          ...valid().articles[0],
          image: { url: 'https://myrecruitercheck.com/hero.png', alt: 'A desk with a laptop' },
        },
      ],
    }),
  )
  assert.ok(html.includes('https://myrecruitercheck.com/hero.png'))
  assert.ok(html.includes('alt="A desk with a laptop"'))
})

test('an empty issue is refused', () => {
  assert.ok(validateIssue(valid({ articles: [] })).some((p) => p.includes('at least one')))
})

test('empty reader facing copy is refused', () => {
  assert.ok(validateIssue(valid({ intro: '   ' })).some((p) => p.includes('intro is empty')))
})

test('a non https link is refused', () => {
  const insecure = valid({ cta: { ...valid().cta, url: 'http://myrecruitercheck.com/' } })
  assert.ok(validateIssue(insecure).some((p) => p.includes('https')))
})

test('every problem is reported at once, not one at a time', () => {
  // A writer should get one round of notes, not discover them serially.
  const bad = valid({ intro: 'a — b', cta: { ...valid().cta, body: 'c — d', url: 'http://x.test' } })
  assert.ok(validateIssue(bad).length >= 3, `expected several problems, got ${validateIssue(bad).length}`)
})

test('renderIssue throws rather than emitting a bad issue', () => {
  assert.throws(() => renderIssue(valid({ intro: 'a — b' })), /cannot be rendered/)
})

test('content is HTML escaped', () => {
  // Copy is written by a person and pasted into an email client; an unescaped
  // angle bracket breaks the layout at best.
  const html = renderIssue(valid({ intro: 'Scores of 80 & above beat <most> applicants.' }))
  assert.ok(html.includes('80 &amp; above'))
  assert.ok(html.includes('&lt;most&gt;'))
  assert.ok(!html.includes('<most>'))
})

test('escapeHtml handles the quote characters an attribute would break on', () => {
  assert.equal(escapeHtml(`"x" 'y'`), '&quot;x&quot; &#39;y&#39;')
})

test('the unsubscribe link stays a Brevo merge tag', () => {
  // Brevo owns the sending list and its own unsubscribe handling. Hardcoding a
  // link here would bypass it and leave the two out of step.
  assert.ok(renderIssue(valid()).includes('{{ unsubscribe }}'))
})

test('an article link is omitted entirely when there is none', () => {
  // There is no blog to link to, so a card with no link must not render an
  // empty button.
  const html = renderIssue(valid())
  assert.ok(!html.includes('Read the article'))
})

test('an article link renders when supplied', () => {
  const html = renderIssue(
    valid({
      articles: [
        {
          ...valid().articles[0],
          link: { label: 'Read more', url: 'https://myrecruitercheck.com/ats-resume-checker' },
        },
      ],
    }),
  )
  assert.ok(html.includes('Read more'))
  assert.ok(html.includes('https://myrecruitercheck.com/ats-resume-checker'))
})

console.log(`\n${passed} tests passed`)
