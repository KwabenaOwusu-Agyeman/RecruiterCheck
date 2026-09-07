// Run with: npx tsx supabase/functions/_shared/newsletter/piece.test.ts
import assert from 'node:assert/strict'
import {
  countWords,
  findUnsupported,
  loadPiece,
  readMinutes,
  renderBody,
} from './piece.ts'

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

const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ')
const source = (body: string, front = 'heading: A heading') => `---\n${front}\n---\n\n${body}`

test('a valid piece loads with its body rendered', () => {
  const r = loadPiece('p', source(words(200)))
  assert.deepEqual(r.problems, [])
  assert.ok(r.piece)
  assert.equal(r.piece.heading, 'A heading')
  assert.equal(r.piece.readMinutes, 1)
})

test('paragraphs and lists render, nothing else needed', () => {
  assert.equal(renderBody('One.\n\nTwo.'), '<p>One.</p><p>Two.</p>')
  assert.equal(renderBody('- a\n- b'), '<ul><li>a</li><li>b</li></ul>')
})

test('bold, italic and links render', () => {
  assert.equal(renderBody('**bold**'), '<p><strong>bold</strong></p>')
  assert.equal(renderBody('*italic*'), '<p><em>italic</em></p>')
  assert.equal(renderBody('[x](https://a.test)'), '<p><a href="https://a.test">x</a></p>')
})

test('raw HTML is inert, not sanitised', () => {
  // Escaping before producing markup means there is no allowlist to get wrong.
  const html = renderBody('<script>alert(1)</script>')
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(!html.includes('<script>'))
})

test('a javascript URL never becomes a link', () => {
  assert.ok(!renderBody('[x](javascript:alert(1))').includes('<a href'))
})

test('a heading inside a piece is refused', () => {
  // The section already carries a heading; a second one competes with it.
  assert.ok(findUnsupported('## Nope').length === 1)
  const r = loadPiece('p', source('## Nope\n\n' + words(200)))
  assert.ok(r.problems.some((p) => p.includes('headings')))
})

test('tables, code blocks and quotes are refused by name', () => {
  assert.ok(findUnsupported('| a |').some((n) => n.includes('tables')))
  assert.ok(findUnsupported('```js').some((n) => n.includes('code')))
  assert.ok(findUnsupported('> q').some((n) => n.includes('quotes')))
})

test('a dash anywhere a reader sees is refused', () => {
  // Checked on the markdown source rather than the rendered HTML, so the error
  // can still name the field.
  assert.ok(loadPiece('p', source('A sentence — with a dash.')).problems.some((p) => p.includes('dash')))
  assert.ok(loadPiece('p', source('Takes 2-3 minutes.')).problems.some((p) => p.includes('dash')))
  assert.ok(
    loadPiece('p', source(words(200), 'heading: A — heading')).problems.some((p) => p.includes('dash')),
  )
})

test('a missing heading or empty body is refused', () => {
  assert.ok(loadPiece('p', source(words(200), 'image: /newsletter/a.jpg')).problems.some((x) => x.includes('heading')))
  assert.ok(loadPiece('p', source('   ')).problems.some((x) => x.includes('no body')))
})

test('an image must be a newsletter path or absolute, with alt text', () => {
  const wrongPath = loadPiece('p', source(words(200), 'heading: H\nimage: /assets/a.jpg\nimageAlt: Alt'))
  assert.ok(wrongPath.problems.some((x) => x.includes('/newsletter/')))

  const noAlt = loadPiece('p', source(words(200), 'heading: H\nimage: /newsletter/a.jpg'))
  assert.ok(noAlt.problems.some((x) => x.includes('imageAlt')))
})

test('length is reported, never judged', () => {
  // A piece has no word target of its own. issue.ts budgets the WHOLE issue at
  // one minute; a second target here would compete with it, and two pieces each
  // passing their own check can still put the issue over. That is how the first
  // draft reached three minutes. loadPiece therefore returns the count and
  // leaves the verdict to the only place that can see the total.
  const short = loadPiece('p', source(words(20)))
  const long = loadPiece('p', source(words(600)))

  assert.deepEqual(short.problems, [])
  assert.deepEqual(long.problems, [])
  assert.equal(short.piece?.wordCount, 20)
  assert.equal(long.piece?.wordCount, 600)
})

test('read time is at least one minute and rounds sensibly', () => {
  assert.equal(readMinutes('three words here'), 1)
  assert.equal(readMinutes(words(400)), 2)
  assert.equal(countWords('- a list item\n- another'), 4)
})

test('a file with no frontmatter fence is refused', () => {
  assert.ok(loadPiece('p', 'Just a body.').problems.some((x) => x.includes('frontmatter')))
})

console.log(`\n${passed} tests passed`)
