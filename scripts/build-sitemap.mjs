// Generates dist/sitemap.xml from the same two sources the prerender uses.
//
//   node scripts/build-sitemap.mjs
//
// It replaces a hand maintained public/sitemap.xml, which went stale exactly as
// that arrangement always does: PRs #69 and #70 changed eight page components
// and nobody edited the dates, so the file told search engines those pages had
// not changed since August.
//
// Two URL sets, two honest sources for lastmod:
//
//   Hand built pages take their date from scripts/static-lastmod.json, which is
//   generated from git by npm run sitemap:lastmod. A route missing from that
//   snapshot fails the build rather than being emitted with a guessed date.
//
//   Editorial content takes `updated`, falling back to `published`. Both are
//   required, validated ISO dates, so neither can be invented.
//
// noindex content and anything not published never reach the index, so neither
// can reach the sitemap.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const clientDir = path.join(rootDir, 'dist')
const serverEntry = path.join(rootDir, 'dist-ssr', 'entry-server.js')
const SITE = 'https://myrecruitercheck.com'

const { contentIndex, STATIC_ROUTES } = await import(serverEntry)
const snapshot = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'scripts', 'static-lastmod.json'), 'utf-8'),
).lastmod

const missing = STATIC_ROUTES.filter((route) => !snapshot[route.path]).map((route) => route.path)
if (missing.length > 0) {
  console.error(
    `\nBuild failed: no lastmod for ${missing.join(', ')}.\n` +
      'Run npm run sitemap:lastmod and commit scripts/static-lastmod.json.\n',
  )
  process.exit(1)
}

const content = contentIndex()
if (content.problems.length > 0) {
  console.error('\nBuild failed: content cannot be published:\n')
  for (const problem of content.problems) console.error(`  ${problem}`)
  console.error('')
  process.exit(1)
}

/** Hand built pages first, in their existing order, then content newest first. */
const entries = [
  ...STATIC_ROUTES.map((route) => ({
    loc: route.path === '/' ? `${SITE}/` : `${SITE}${route.path}`,
    lastmod: snapshot[route.path],
    changefreq: route.changefreq,
    priority: route.priority,
  })),
  ...content.items
    .filter((item) => !item.noindex)
    .map((item) => ({
      loc: `${SITE}${item.type === 'newsletter' ? '/newsletter' : '/resources'}/${item.slug}`,
      lastmod: item.updated ?? item.published,
      changefreq: item.type === 'newsletter' ? 'yearly' : 'monthly',
      priority: '0.7',
    })),
]

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...entries.map(
    (entry) =>
      '  <url>\n' +
      `    <loc>${entry.loc}</loc>\n` +
      `    <lastmod>${entry.lastmod}</lastmod>\n` +
      `    <changefreq>${entry.changefreq}</changefreq>\n` +
      `    <priority>${entry.priority}</priority>\n` +
      '  </url>',
  ),
  '</urlset>',
  '',
].join('\n')

fs.writeFileSync(path.join(clientDir, 'sitemap.xml'), xml)
console.log(
  `sitemap: ${entries.length} urls (${STATIC_ROUTES.length} hand built, ${entries.length - STATIC_ROUTES.length} editorial)`,
)
