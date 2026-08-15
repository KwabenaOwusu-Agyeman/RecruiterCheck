// Statically renders the public marketing routes at build time so raw HTML
// (no JS execution) carries real body content and per-route <title>,
// <meta name="description">, canonical, and OG tags — not just the
// homepage's, and not only after client-side JS runs.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const clientDir = path.join(rootDir, 'dist')
const serverEntry = path.join(rootDir, 'dist-ssr', 'entry-server.js')

const ROUTES = [
  '/',
  '/example-check',
  '/faq',
  '/terms',
  '/privacy',
  '/cookies',
  '/disclaimer',
  '/application-checker',
  '/free-cv-checker',
  '/ats-resume-checker',
  '/tailor-cv-to-job-description',
  '/cv-keyword-checker',
  '/cover-letter-generator',
  '/recruiter-message-generator',
  '/resume-strengths-and-weaknesses',
  '/job-application-feedback',
  '/resume-job-description-match',
  '/interview-probability-score',
  '/software-engineer-resume-checker',
  '/registered-nurse-resume-checker',
  '/project-manager-resume-checker',
  '/sales-resume-checker',
  '/administrative-assistant-resume-checker',
]

const template = fs.readFileSync(path.join(clientDir, 'index.html'), 'utf-8')
const { render } = await import(serverEntry)

function withTag(html, regex, replacement) {
  return regex.test(html) ? html.replace(regex, replacement) : html
}

function applyMeta(html, meta) {
  if (!meta) return html
  const { title, description, url } = meta
  const escaped = title.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  let out = html
  out = withTag(out, /<title>[^<]*<\/title>/, `<title>${escaped}</title>`)
  out = withTag(
    out,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
    `<meta name="description" content="${description.replace(/"/g, '&quot;')}" />`,
  )
  out = withTag(
    out,
    /<link rel="canonical" href="[^"]*"\s*\/>/,
    `<link rel="canonical" href="${url}" />`,
  )
  out = withTag(
    out,
    /<meta property="og:title" content="[^"]*"\s*\/>/,
    `<meta property="og:title" content="${escaped}" />`,
  )
  out = withTag(
    out,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:description" content="${description.replace(/"/g, '&quot;')}" />`,
  )
  out = withTag(
    out,
    /<meta property="og:url" content="[^"]*"\s*\/>/,
    `<meta property="og:url" content="${url}" />`,
  )
  return out
}

for (const route of ROUTES) {
  const { html, meta } = render(route)
  let page = template.replace('<div id="root"></div>', `<div id="root">${html}</div>`)
  page = applyMeta(page, meta)

  const outDir = route === '/' ? clientDir : path.join(clientDir, route)
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'index.html'), page)
  console.log(`prerendered ${route}${meta ? '' : ' (no page meta found)'}`)
}
