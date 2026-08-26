// Statically renders the public marketing routes at build time so raw HTML
// (no JS execution) carries real body content and per-route <title>,
// <meta name="description">, canonical, and OG tags — not just the
// homepage's, and not only after client-side JS runs.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const clientDir = path.join(rootDir, 'dist')
const serverEntry = path.join(rootDir, 'dist-ssr', 'entry-server.js')

const ROUTES = [
  '/',
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
  '/how-interview-score-works',
  '/software-engineer-resume-checker',
  '/data-analyst-cv-checker',
  '/data-scientist-cv-checker',
  '/machine-learning-engineer-cv-checker',
  '/ai-engineer-cv-checker',
  '/myrecruitercheck-vs-jobscan',
  '/myrecruitercheck-vs-resume-worded',
  '/myrecruitercheck-vs-teal',
  '/myrecruitercheck-vs-rezi',
  '/myrecruitercheck-vs-kickresume',
  '/myrecruitercheck-vs-chatgpt',
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

// Every rendered route's <script type="application/ld+json"> blocks are
// inline scripts, and vercel.json's CSP script-src has no 'unsafe-inline' —
// it allowlists specific inline scripts by SHA-256 hash instead. Structured
// data added to any page (FAQPage, BreadcrumbList, ...) is silently dropped
// by the browser unless its exact hash is already in that allowlist. Collect
// every hash actually needed here, then reconcile vercel.json below instead
// of letting broken structured data ship quietly or stale hashes pile up.
const neededLdJsonHashes = new Map()

function collectLdJsonHashes(page, route) {
  for (const match of page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const hash = `sha256-${crypto.createHash('sha256').update(match[1], 'utf-8').digest('base64')}`
    if (!neededLdJsonHashes.has(hash)) neededLdJsonHashes.set(hash, route)
  }
}

for (const route of ROUTES) {
  const { html, meta } = render(route)
  let page = template.replace('<div id="root"></div>', `<div id="root">${html}</div>`)
  page = applyMeta(page, meta)
  collectLdJsonHashes(page, route)

  const outDir = route === '/' ? clientDir : path.join(clientDir, route)
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'index.html'), page)
  console.log(`prerendered ${route}${meta ? '' : ' (no page meta found)'}`)
}

// Vercel automatically serves a root-level 404.html (with a genuine HTTP 404
// status) for any request that matches neither a static file nor a rewrite
// rule. Rendering an unmatched path here hits AppRoutes' catch-all "*" route
// (NotFoundPage), so this file carries the same branded markup as the SPA's
// client-side 404 instead of a bare fallback. Rendered before CSP
// reconciliation below so its structured data (if any is ever added) is
// covered by the same pass.
{
  const { html, meta } = render('/__not-found__')
  let page = template.replace('<div id="root"></div>', `<div id="root">${html}</div>`)
  page = applyMeta(page, meta)
  collectLdJsonHashes(page, '/__not-found__')
  fs.writeFileSync(path.join(clientDir, '404.html'), page)
  console.log('prerendered /404.html')
}

// Hashes for an inline script that is NOT scanned above (i.e. not rendered
// by `render()` as part of a route's HTML) but must still be CSP-allowed —
// e.g. a one-off inline script added directly to index.html outside the
// ld+json scan. Empty today. Add a hash here, not by hand-editing
// vercel.json, since reconcileCspHashes() below owns every hash it put
// there on a previous run and will remove it once it's no longer needed.
const MANUALLY_MANAGED_SCRIPT_HASHES = new Set([])

// Tracks exactly which script-src hashes THIS script previously wrote to
// vercel.json, so reconciliation can tell "stale hash we manage, safe to
// remove" apart from "hash someone else added by hand, must not touch."
// Without this ledger, reconciliation could only see the hash *strings*
// currently in vercel.json with no way to know which ones it's allowed to
// delete — provenance, not content, is what makes removal safe.
const managedHashesLedgerPath = path.join(rootDir, 'scripts', 'csp-managed-hashes.json')

function readManagedHashLedger() {
  if (!fs.existsSync(managedHashesLedgerPath)) return new Set()
  try {
    const parsed = JSON.parse(fs.readFileSync(managedHashesLedgerPath, 'utf-8'))
    if (!Array.isArray(parsed.hashes)) throw new Error('expected { "hashes": string[] }')
    return new Set(parsed.hashes)
  } catch (err) {
    console.error(`\nBuild failed: could not read ${path.relative(rootDir, managedHashesLedgerPath)}: ${err.message}\n`)
    process.exit(1)
  }
}

function reconcileCspHashes(neededHashesMap) {
  const vercelConfigPath = path.join(rootDir, 'vercel.json')

  let vercelConfig
  try {
    vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf-8'))
  } catch (err) {
    console.error(`\nBuild failed: could not read/parse vercel.json: ${err.message}\n`)
    process.exit(1)
  }

  const cspRule = vercelConfig.headers?.[0]?.headers?.find((h) => h.key === 'Content-Security-Policy')
  if (!cspRule) {
    console.error('\nBuild failed: vercel.json has no Content-Security-Policy header rule to reconcile.\n')
    process.exit(1)
  }

  const directives = cspRule.value.split('; ')
  const scriptSrcIndex = directives.findIndex((d) => d.startsWith('script-src '))
  if (scriptSrcIndex === -1) {
    console.error('\nBuild failed: vercel.json CSP has no script-src directive to reconcile.\n')
    process.exit(1)
  }

  const HASH_TOKEN = /^'sha256-[A-Za-z0-9+/=]+'$/
  const tokens = directives[scriptSrcIndex].split(' ')
  // Any token that isn't a quoted sha256- hash is an unrelated CSP source
  // ('self', an allowlisted host, ...) — left untouched, original order.
  const unrelatedSources = tokens.filter((t) => !HASH_TOKEN.test(t))
  const currentHashes = new Set(tokens.filter((t) => HASH_TOKEN.test(t)).map((t) => t.slice(1, -1)))

  const previouslyManaged = readManagedHashLedger()
  // A hash currently in the CSP that this script did NOT put there is
  // someone else's — always preserved, never a candidate for removal.
  const foreignHashes = [...currentHashes].filter((h) => !previouslyManaged.has(h))

  const needed = new Set(neededHashesMap.keys())
  const finalHashSet = new Set([...foreignHashes, ...needed, ...MANUALLY_MANAGED_SCRIPT_HASHES])
  const sortedHashes = [...finalHashSet].sort()

  const added = sortedHashes.filter((h) => !currentHashes.has(h))
  const removed = [...currentHashes].filter((h) => !finalHashSet.has(h))

  directives[scriptSrcIndex] = [...unrelatedSources, ...sortedHashes.map((h) => `'${h}'`)].join(' ')
  const newCspValue = directives.join('; ')
  const changed = newCspValue !== cspRule.value
  cspRule.value = newCspValue

  const nextManagedLedger = new Set([...needed, ...MANUALLY_MANAGED_SCRIPT_HASHES])
  const ledgerChanged =
    nextManagedLedger.size !== previouslyManaged.size || [...nextManagedLedger].some((h) => !previouslyManaged.has(h))

  if (changed) {
    try {
      fs.writeFileSync(vercelConfigPath, JSON.stringify(vercelConfig, null, 2) + '\n')
    } catch (err) {
      console.error(`\nBuild failed: could not write reconciled vercel.json: ${err.message}\n`)
      process.exit(1)
    }
  }
  if (ledgerChanged) {
    try {
      fs.writeFileSync(
        managedHashesLedgerPath,
        JSON.stringify({ hashes: [...nextManagedLedger].sort() }, null, 2) + '\n',
      )
    } catch (err) {
      console.error(`\nBuild failed: could not write ${path.relative(rootDir, managedHashesLedgerPath)}: ${err.message}\n`)
      process.exit(1)
    }
  }

  // Fail loudly rather than trust our own edit: re-read the file back and
  // verify every needed hash is actually present, byte for byte.
  let verifyConfig
  try {
    verifyConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf-8'))
  } catch (err) {
    console.error(`\nBuild failed: vercel.json is not valid JSON after CSP reconciliation: ${err.message}\n`)
    process.exit(1)
  }
  const verifyCsp = verifyConfig.headers?.[0]?.headers?.find((h) => h.key === 'Content-Security-Policy')?.value ?? ''
  const stillMissing = [...needed].filter((h) => !verifyCsp.includes(`'${h}'`))
  if (stillMissing.length > 0) {
    console.error('\nBuild failed: CSP reconciliation did not produce a valid script-src. Missing:\n')
    stillMissing.forEach((h) => console.error(`  '${h}'`))
    process.exit(1)
  }
  for (const src of unrelatedSources) {
    if (!verifyCsp.includes(src)) {
      console.error(`\nBuild failed: CSP reconciliation dropped an unrelated script-src source: ${src}\n`)
      process.exit(1)
    }
  }

  if (changed || ledgerChanged) {
    console.log(
      `reconciled CSP script-src — ${finalHashSet.size} structured-data hash(es) total ` +
        `(+${added.length} added, -${removed.length} stale removed, ${foreignHashes.length} foreign hash(es) preserved)`,
    )
    added.forEach((h) => console.log(`  + '${h}'`))
    removed.forEach((h) => console.log(`  - '${h}'`))
  } else {
    console.log(`verified ${finalHashSet.size} structured data script hash(es) against vercel.json CSP (no changes needed)`)
  }
}

reconcileCspHashes(neededLdJsonHashes)
