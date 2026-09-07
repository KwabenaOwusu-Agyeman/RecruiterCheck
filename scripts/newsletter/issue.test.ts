// Run with: npx tsx scripts/newsletter/issue.test.ts
import assert from 'node:assert/strict'
import {
  MAX_POSTINGS,
  WORD_CEILING,
  countIssueWords,
  escapeHtml,
  renderIssue,
  validateIssue,
  type Issue,
} from './issue.ts'

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

const posting = (over = {}) => ({
  role: 'Machine Learning Engineer',
  company: 'An employer',
  location: 'Amsterdam',
  note: 'Names its stack up front.',
  url: 'https://example.com/a-role',
  ...over,
})

const piece = (over = {}) => ({
  heading: 'You were rejected before anyone reached your second page',
  html: '<p>Eleven seconds.</p>',
  readMinutes: 1,
  wordCount: 2,
  ...over,
})

const valid = (over: Partial<Issue> = {}): Issue => ({
  week: 37,
  period: 'September 2026',
  greeting: 'Hi {{ contact.FIRSTNAME }},',
  intro: 'Five roles worth a look, one reason applications die, and what changed this month.',
  postings: [posting()],
  rejection: piece(),
  trends: piece({ heading: 'Postings started naming the stack' }),
  cta: {
    heading: 'Find out which line lost it',
    body: 'Run your CV against the job you actually want, before you send it.',
    label: 'Check',
    url: 'https://myrecruitercheck.com/',
  },
  signOff: { name: 'Kwabena', role: 'Founder of MyRecruiterCheck' },
  ...over,
})

test('a well formed issue renders all three sections', () => {
  assert.deepEqual(validateIssue(valid()), [])
  const html = renderIssue(valid())
  assert.match(html, /Jobs in AI and tech/)
  assert.match(html, /Why applications get rejected/)
  assert.match(html, /Hiring trends/)
})

test('the sections render in the fixed order', () => {
  // The format is postings, then the pain, then trends. The call to action is
  // the resolution the rejection piece deliberately withholds, so it comes last.
  const html = renderIssue(valid())
  const order = ['Jobs in AI and tech', 'Why applications get rejected', 'Hiring trends', 'Find out which line lost it']
  const positions = order.map((label) => html.indexOf(label))
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b))
  assert.ok(positions.every((p) => p > -1))
})

test('brand tokens are used, not invented colours', () => {
  const html = renderIssue(valid())
  assert.ok(html.includes('#020C38'), 'navy missing')
  assert.ok(html.includes('#F8F6F2'), 'cream missing')
  assert.ok(html.includes('Inter,'), 'brand font missing')
})

test('five postings are allowed and six are not', () => {
  const five = valid({ postings: Array.from({ length: MAX_POSTINGS }, () => posting()) })
  assert.deepEqual(validateIssue(five), [])

  const six = valid({ postings: Array.from({ length: MAX_POSTINGS + 1 }, () => posting()) })
  assert.ok(validateIssue(six).some((p) => p.includes(`At most ${MAX_POSTINGS}`)))
})

test('the whole issue is measured, not each section on its own', () => {
  // The failure this catches: two pieces that are each a reasonable length, and
  // an issue that is twice as long as it claims to be. Only the total is real.
  const long = 'word '.repeat(400).trim()
  const issue = valid({ rejection: piece({ html: `<p>${long}</p>`, wordCount: 400 }) })

  assert.ok(countIssueWords(issue) > WORD_CEILING)
  assert.ok(validateIssue(issue).some((p) => p.includes('minute')))
})

test('the count covers every part a reader reads', () => {
  // A budget that ignored the postings would let the longest section escape it.
  const base = countIssueWords(valid({ postings: [posting()] }))
  const more = countIssueWords(valid({ postings: [posting(), posting()] }))
  assert.ok(more > base, 'postings must count toward the issue length')

  const longerIntro = countIssueWords(valid({ intro: `${valid().intro} And another clause here.` }))
  assert.ok(longerIntro > base, 'the intro must count toward the issue length')
})

test('an issue with no postings is refused', () => {
  assert.ok(validateIssue(valid({ postings: [] })).some((p) => p.includes('at least one job posting')))
})

test('a dash in copy this file owns is refused', () => {
  // Piece bodies are checked by piece.ts on their markdown source. Everything
  // else a reader sees is checked here.
  for (const issue of [
    valid({ intro: 'Five roles — one reason.' }),
    valid({ cta: { ...valid().cta, body: 'Takes 2-3 minutes.' } }),
    valid({ postings: [posting({ note: 'Named stack — worth a look.' })] }),
  ]) {
    assert.ok(validateIssue(issue).some((p) => p.includes('dash')))
  }
})

test('a Brevo merge tag is not mistaken for copy', () => {
  const html = renderIssue(valid())
  assert.ok(html.includes('{{ contact.FIRSTNAME }}'), 'greeting tag must not be escaped')
  assert.ok(html.includes('{{ unsubscribe }}'), 'unsubscribe must stay Brevo owned')
})

test('a posting must link over https', () => {
  const insecure = valid({ postings: [posting({ url: 'http://example.com/x' })] })
  assert.ok(validateIssue(insecure).some((p) => p.includes('https')))
})

test('a piece image must be absolute', () => {
  // An inbox has no origin to resolve a relative path against, so a repo path
  // reaching this far would render as a broken image.
  const relative = valid({ rejection: piece({ image: { url: '/newsletter/a.jpg', alt: 'Alt' } }) })
  assert.ok(validateIssue(relative).some((p) => p.includes('absolute')))
})

test('a piece image needs alt text', () => {
  const noAlt = valid({ rejection: piece({ image: { url: 'https://x.test/a.jpg', alt: '' } }) })
  assert.ok(validateIssue(noAlt).some((p) => p.includes('alt is empty')))
})

test('piece HTML is passed through, having been escaped at source', () => {
  // piece.ts escapes before producing markup, so issue.ts must not escape a
  // second time or every paragraph tag would render as visible text.
  const html = renderIssue(valid({ rejection: piece({ html: '<p>Eleven seconds.</p>' }) }))
  assert.ok(html.includes('<p>Eleven seconds.</p>'))
  assert.ok(!html.includes('&lt;p&gt;Eleven'))
})

test('the read time is shown on each piece', () => {
  const html = renderIssue(valid({ rejection: piece({ readMinutes: 2 }) }))
  assert.ok(html.includes('2 min read'))
})

test('postings are escaped, since they are pasted from job boards', () => {
  const html = renderIssue(valid({ postings: [posting({ company: 'A & B <script>' })] }))
  assert.ok(html.includes('A &amp; B &lt;script&gt;'))
  assert.ok(!html.includes('<script>'))
})

test('every problem is reported at once', () => {
  const bad = valid({ intro: 'a — b', cta: { ...valid().cta, body: 'c — d', url: 'http://x.test' } })
  assert.ok(validateIssue(bad).length >= 3)
})

test('renderIssue throws rather than emitting a bad issue', () => {
  assert.throws(() => renderIssue(valid({ intro: 'a — b' })), /cannot be rendered/)
})

test('escapeHtml covers the five characters that matter', () => {
  assert.equal(escapeHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;')
})

console.log(`\n${passed} tests passed`)
