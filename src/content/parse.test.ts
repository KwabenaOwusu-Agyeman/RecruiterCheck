// Run with: npx tsx src/content/parse.test.ts
//
// The publishing model's guarantees, stated as tests: a draft never becomes a
// page, a date is never invented, and two files can never claim one URL.
import assert from 'node:assert/strict'
import { findCollectionProblems, parseContentFile } from './parse.ts'
import { BASE_PATH, isValidDate, pathFor, type ContentItem } from './schema.ts'

const tests: { name: string; run: () => void }[] = []
const test = (name: string, run: () => void) => tests.push({ name, run })

function file(overrides: Record<string, string> = {}, body = 'A paragraph of copy.') {
  const front: Record<string, string> = {
    type: 'article',
    slug: 'a-slug',
    title: 'A title',
    description: 'A description.',
    published: '2026-09-08',
    status: 'published',
    cluster: 'recruiter-evaluation',
    ...overrides,
  }
  const lines = Object.entries(front)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}: ${value}`)
  return `---\n${lines.join('\n')}\n---\n\n${body}\n`
}

test('a complete article parses', () => {
  const { item, problems } = parseContentFile('content/resources/a.md', file())
  assert.deepEqual(problems, [])
  assert.ok(item)
  assert.equal(item.slug, 'a-slug')
  assert.equal(item.status, 'published')
  assert.equal(item.noindex, false)
  assert.equal(item.html, '<p>A paragraph of copy.</p>')
  assert.equal(pathFor(item), '/resources/a-slug')
})

test('a draft parses but is marked unpublished, so the loader can drop it', () => {
  const { item, problems } = parseContentFile('content/resources/a.md', file({ status: 'draft' }))
  assert.deepEqual(problems, [])
  assert.equal(item?.status, 'draft')
})

test('every required field is reported, in one pass', () => {
  const source = '---\ntype: article\n---\n\nBody.\n'
  const { item, problems } = parseContentFile('content/resources/a.md', source)
  assert.equal(item, null)
  for (const field of ['slug', 'title', 'description', 'published', 'status', 'cluster']) {
    assert.ok(
      problems.some((p) => p.includes(field)),
      `expected a problem mentioning ${field}, got ${problems.join(' | ')}`,
    )
  }
})

test('a publication date is never inferred', () => {
  const { item, problems } = parseContentFile('content/resources/a.md', file({ published: '' }))
  assert.equal(item, null)
  assert.ok(problems.some((p) => p.includes('never inferred')))
})

test('a malformed date fails rather than being coerced', () => {
  for (const bad of ['08-09-2026', '2026-9-8', '2026-13-01', '2026-02-30', 'yesterday']) {
    const { item } = parseContentFile('content/resources/a.md', file({ published: bad }))
    assert.equal(item, null, `${bad} should not parse`)
  }
  assert.equal(isValidDate('2026-09-08'), true)
})

test('updated before published is refused', () => {
  const { item, problems } = parseContentFile(
    'content/resources/a.md',
    file({ published: '2026-09-08', updated: '2026-09-01' }),
  )
  assert.equal(item, null)
  assert.ok(problems.some((p) => p.includes('is before published')))
})

test('an unknown cluster fails, so Notion and the repo cannot drift silently', () => {
  const { item, problems } = parseContentFile('content/resources/a.md', file({ cluster: 'invented' }))
  assert.equal(item, null)
  assert.ok(problems.some((p) => p.includes('Content Authority Map')))
})

test('a reserved slug cannot shadow a hand built route', () => {
  const { item, problems } = parseContentFile(
    'content/issues/a.md',
    file({ type: 'newsletter', slug: 'unsubscribe' }),
  )
  assert.equal(item, null)
  assert.ok(problems.some((p) => p.includes('reserved')))
  assert.equal(BASE_PATH.newsletter, '/newsletter')
})

test('a malformed slug is refused', () => {
  for (const bad of ['Has Capitals', 'trailing-', 'double--hyphen', 'has_underscore', 'has/slash']) {
    const { item } = parseContentFile('content/resources/a.md', file({ slug: bad }))
    assert.equal(item, null, `${bad} should not parse`)
  }
})

test('dashes in user facing copy are refused, per the copy conventions', () => {
  assert.equal(parseContentFile('content/resources/a.md', file({ title: 'A well-known title' })).item, null)
  assert.equal(parseContentFile('content/resources/a.md', file({}, 'Takes 2-3 minutes.')).item, null)
})

test('headings render, and a top level heading is refused', () => {
  const ok = parseContentFile('content/resources/a.md', file({}, '## A section\n\nCopy.'))
  assert.equal(ok.problems.length, 0)
  assert.ok(ok.item?.html.includes('<h2>A section</h2>'))

  const h1 = parseContentFile('content/resources/a.md', file({}, '# A page title\n\nCopy.'))
  assert.equal(h1.item, null)
  assert.ok(h1.problems.some((p) => p.includes('top level heading')))
})

test('raw HTML in a file is inert, because the source is escaped before markup', () => {
  const { item } = parseContentFile('content/resources/a.md', file({}, '<script>alert(1)</script>'))
  assert.ok(item)
  assert.ok(!item.html.includes('<script>'))
  assert.ok(item.html.includes('&lt;script&gt;'))
})

test('supports is a list of paths', () => {
  const { item } = parseContentFile(
    'content/resources/a.md',
    file({ supports: '/ats-resume-checker, /free-cv-checker' }),
  )
  assert.deepEqual(item?.supports, ['/ats-resume-checker', '/free-cv-checker'])
})

test('noindex is a boolean, and anything else fails', () => {
  assert.equal(parseContentFile('content/resources/a.md', file({ noindex: 'true' })).item?.noindex, true)
  assert.equal(parseContentFile('content/resources/a.md', file({ noindex: 'false' })).item?.noindex, false)
  assert.equal(parseContentFile('content/resources/a.md', file({ noindex: 'yes' })).item, null)
})

test('an image without alt text is refused', () => {
  const { item, problems } = parseContentFile('content/resources/a.md', file({ image: '/social/og-image.png' }))
  assert.equal(item, null)
  assert.ok(problems.some((p) => p.includes('imageAlt')))
})

test('two files cannot claim one URL', () => {
  const a = parseContentFile('content/resources/a.md', file()).item as ContentItem
  const b = parseContentFile('content/resources/b.md', file()).item as ContentItem
  const problems = findCollectionProblems([a, b])
  assert.equal(problems.length, 1)
  assert.ok(problems[0].includes('collides'))
  assert.deepEqual(findCollectionProblems([a]), [])
})

test('a file with no frontmatter fence is refused', () => {
  const { item, problems } = parseContentFile('content/resources/a.md', 'Just a body.\n')
  assert.equal(item, null)
  assert.ok(problems[0].includes('no frontmatter'))
})

let failed = 0
for (const { name, run } of tests) {
  try {
    run()
    console.log(`ok - ${name}`)
  } catch (error) {
    failed += 1
    console.error(`not ok - ${name}`)
    console.error(error instanceof Error ? error.message : error)
  }
}
console.log(`\n${tests.length - failed}/${tests.length} tests passed`)
if (failed > 0) process.exit(1)
