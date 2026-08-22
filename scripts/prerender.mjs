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
  '/about',
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
  '/how-recruiters-evaluate-a-cv',
  '/resume-job-description-match',
  '/interview-probability-score',
  '/software-engineer-resume-checker',
  '/registered-nurse-resume-checker',
  '/project-manager-resume-checker',
  '/sales-resume-checker',
  '/administrative-assistant-resume-checker',
  '/myrecruitercheck-vs-jobscan',
  '/myrecruitercheck-vs-resume-worded',
  '/myrecruitercheck-vs-teal',
  '/myrecruitercheck-vs-rezi',
  '/myrecruitercheck-vs-kickresume',
  '/pricing',
]

const template = fs.readFileSync(path.join(clientDir, 'index.html'), 'utf-8')
const { render } = await import(serverEntry)

// vercel.json's catch-all rewrite sends every path with no matching static
// file (all authenticated app routes: /account/billing, /checks/:id, /my-checks,
// ...) to /index.html. Once the loop below overwrites dist/index.html with the
// prerendered homepage markup, those routes would hydrate the real app against
// the homepage's DOM on a hard load/refresh — a guaranteed hydration mismatch
// (React errors #418/#423) that forces a full client re-render and freezes the
// tab. Keep an empty-root shell for the rewrite to target instead; the
// prerendered routes are still served as real static files, which Vercel
// checks before falling back to the rewrite.
fs.writeFileSync(path.join(clientDir, 'app-shell.html'), template)

function withTag(html, regex, replacement) {
  return regex.test(html) ? html.replace(regex, replacement) : html
}

function applyMeta(html, meta) {
  if (!meta) return html
  const { title, description, url, noindex } = meta
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
  if (noindex) {
    out = withTag(
      out,
      /<meta name="robots" content="[^"]*"\s*\/>/,
      `<meta name="robots" content="noindex, nofollow" />`,
    )
  }
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

// Vercel automatically serves a root-level 404.html (with a genuine HTTP 404
// status) for any request that matches neither a static file nor a rewrite
// rule. Rendering an unmatched path here hits AppRoutes' catch-all "*" route
// (NotFoundPage), so this file carries the same branded markup as the SPA's
// client-side 404 instead of a bare fallback.
{
  const { html, meta } = render('/__not-found__')
  let page = template.replace('<div id="root"></div>', `<div id="root">${html}</div>`)
  page = applyMeta(page, meta)
  fs.writeFileSync(path.join(clientDir, '404.html'), page)
  console.log('prerendered /404.html')
}
