#!/usr/bin/env node
// Maps changed files to the checks that are actually relevant, so a change is
// not gated on the whole suite and a relevant check is not skipped.
//
//   node scripts/which-checks.mjs               changes vs HEAD
//   node scripts/which-checks.mjs <path>...     explicit paths
//   node scripts/which-checks.mjs --json        machine readable
//
// This prints what to run. It deliberately runs nothing itself: deciding and
// executing are separate so the decision can be reviewed.

import { execSync } from 'node:child_process'

const argv = process.argv.slice(2)
const asJson = argv.includes('--json')
const explicit = argv.filter((a) => !a.startsWith('--'))

let changed = explicit
if (!changed.length) {
  const out = execSync('git status --porcelain', { encoding: 'utf8' })
  changed = out.split('\n').map((l) => l.slice(3).trim()).filter(Boolean)
}

const has = (re) => changed.some((f) => re.test(f))

// A change touching only prose or agent config needs no code checks. Kept
// deliberately narrow: anything with an executable extension falls through.
const DOCS_ONLY = /(\.md$|^docs\/|^\.claude\/|^CLAUDE\.md$|^\.gitignore$|^brand-concepts\/)/
const docsOnly = changed.length > 0 && changed.every((f) => DOCS_ONLY.test(f))

// Order matters only for readability; every matching rule contributes.
const RULES = [
  {
    id: 'scoring',
    when: () => has(/^src\/lib\/scoring\.ts$/) ||
                has(/^supabase\/functions\/analyze-check\//) ||
                has(/^supabase\/functions\/keyword-scan\//) ||
                has(/^fixtures\/synthetic\//),
    label: 'Scoring change',
    checks: ['npm run lint', 'npm run typecheck', 'npm run test:scoring',
             'node scripts/mutation-check.mjs', 'git diff review'],
    notes: ['test:scoring includes the synthetic CV and job description regression.',
            'The mutation check proves the suite still detects a scoring change.',
            'Never edit an expected score or verdict to make a diff pass. That is the regression.'],
  },
  {
    id: 'frontend',
    when: () => has(/^src\/(components|pages|features|layouts|hooks)\//) ||
                has(/^src\/.*\.tsx$/) || has(/^tailwind\.config\.js$/) || has(/^src\/index\.css$/),
    label: 'Frontend or UI change',
    checks: ['npm run lint', 'npm run typecheck', 'npm run test:unit', 'git diff review'],
    notes: ['MANUAL CHECK REQUIRED: no browser or console test tooling exists in this repo.',
            'Browser and console checks are a manual step against localhost:5173 only,',
            'never against the hosted site. Do not add a browser framework without asking.'],
  },
  {
    id: 'edge',
    when: () => has(/^supabase\/functions\//),
    label: 'Supabase Edge Function change',
    checks: ['npm run lint', 'npm run typecheck', 'npm run test:edge', 'git diff review'],
    notes: ['Local and static tests only.',
            'Never deploy a function, execute production SQL, apply a migration,',
            'or query production user data to verify a change.'],
  },
  {
    id: 'migration',
    when: () => has(/^supabase\/migrations\//),
    label: 'Database migration',
    checks: ['supabase db reset (LOCAL only)', 'regenerate src/types/database.ts', 'npm run test:edge',
             'RLS review', 'git diff review'],
    notes: ['Do not execute migrations against production. Applying to the hosted project is yours to run.',
            'Regenerate types with the migration. A stale database.ts makes the compiler agree with',
            'code the database will reject: it once hid four tables and seventeen RPCs, so edge',
            'functions calling superseded RPCs typechecked clean and failed only in production.'],
  },
  {
    id: 'seo',
    when: () => has(/^src\/pages\//) || has(/^content\//) || has(/^index\.html$/) ||
                has(/^public\/(sitemap|robots)/) || has(/^scripts\/prerender\.mjs$/),
    label: 'SEO or prerendered content change',
    checks: ['npm run build (build validation, includes prerender)',
             'sitemap and metadata check against dist/', 'git diff review'],
    notes: ['MANUAL CHECK REQUIRED: no structured data validator exists in this repo.',
            'Validate JSON-LD by hand or in an external validator. Do not install a tool for it.'],
  },
  {
    id: 'config',
    when: () => has(/^(vercel\.json|middleware\.ts|index\.html|supabase\/config\.toml|\.env\.example)$/),
    label: 'Configuration change',
    checks: ['npm run build', 'CSP hash check against scripts/csp-managed-hashes.json', 'git diff review'],
    notes: ['vercel.json pins ~50 inline script hashes. Changing inline script content without',
            'regenerating them breaks production silently.'],
  },
  {
    id: 'security',
    when: () => has(/^supabase\/migrations\//) ||
                has(/(auth|Auth)/) || has(/stripe|checkout|billing|credit|pack/i) ||
                has(/^supabase\/functions\/(create-checkout-session|stripe-webhook|delete-account|request-refund)\//) ||
                has(/upload|storage|document/i),
    label: 'Security sensitive surface',
    checks: ['mandatory security review', 'RLS review if policies changed', 'git diff review'],
    notes: ['Mandatory, not discretionary: auth, payments or credits, RLS, storage or uploads,',
            'Edge Function request handling, or anything reading candidate data.'],
  },
]

const matched = RULES.filter((r) => r.when())

if (asJson) {
  console.log(JSON.stringify({ changed, checks: matched.map((m) => ({ id: m.id, label: m.label, checks: m.checks })) }, null, 2))
  process.exit(0)
}

if (!changed.length) {
  console.log('No changes detected.')
  process.exit(0)
}

console.log(`Changed files (${changed.length}):`)
changed.slice(0, 20).forEach((f) => console.log(`  ${f}`))
if (changed.length > 20) console.log(`  ... and ${changed.length - 20} more`)

if (docsOnly) {
  console.log('\nDocumentation or agent config only. No code checks needed; review the diff.')
  process.exit(0)
}

if (!matched.length) {
  console.log('\nNo trigger matched. Run `npm run lint` and `npm run typecheck`, then review the diff.')
  process.exit(0)
}

console.log('\nRelevant checks:')
for (const m of matched) {
  console.log(`\n  ${m.label}`)
  m.checks.forEach((c) => console.log(`    - ${c}`))
  m.notes.forEach((n) => console.log(`      note: ${n}`))
}
console.log('\nRun only these. Running the full suite for an unrelated change is noise, not rigour.')
