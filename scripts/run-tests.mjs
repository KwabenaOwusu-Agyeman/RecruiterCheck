#!/usr/bin/env node
// Aggregate test runner for MyRecruiterCheck.
//
// This repo's convention is one self-contained test file per module, each
// using node:assert/strict and carrying a `// Run with: npx tsx <path>`
// header. That convention is unchanged — this script only discovers those
// files and runs them, so any single file can still be run by hand exactly
// as its header says.
//
//   node scripts/run-tests.mjs                     every test
//   node scripts/run-tests.mjs --filter scoring    paths containing "scoring"
//   node scripts/run-tests.mjs --list              show what would run
//
// Exits non-zero if any test file fails, so it is safe to chain with &&.

import { readdirSync, statSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SEARCH_ROOTS = ['src', 'supabase/functions']
// review/ holds archived audit artifacts whose *.test.ts files are Deno
// tests (remote URL imports, Deno.test); they are not run by this runner.
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-ssr', '.agents', '.scratch', 'review'])

function discover(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) discover(full, out)
    else if (entry.endsWith('.test.ts')) out.push(relative(ROOT, full))
  }
  return out
}

const args = process.argv.slice(2)
const filters = args
  .filter((a) => a.startsWith('--filter'))
  .flatMap((a) => (a.includes('=') ? a.split('=')[1] : args[args.indexOf(a) + 1] || '').split(','))
  .map((s) => s.trim())
  .filter(Boolean)

let files = SEARCH_ROOTS.flatMap((r) => discover(join(ROOT, r))).sort()
if (filters.length) files = files.filter((f) => filters.some((s) => f.includes(s)))

if (args.includes('--list')) {
  files.forEach((f) => console.log(f))
  process.exit(0)
}

if (files.length === 0) {
  console.error(filters.length ? `No test files match: ${filters.join(', ')}` : 'No test files found.')
  process.exit(1)
}

// tsx is a pinned devDependency, so prefer the local binary: reproducible on a
// clean checkout and no network. Fall back to npx only if node_modules is not
// installed, and say so plainly rather than failing 15 times over.
const LOCAL_TSX = join(ROOT, 'node_modules', '.bin', 'tsx')
const useLocal = existsSync(LOCAL_TSX)
const runner = useLocal ? LOCAL_TSX : 'npx'
const prefix = useLocal ? [] : ['--no-install', 'tsx']
const probe = spawnSync(runner, [...prefix, '--version'], { encoding: 'utf8' })
if (probe.status !== 0) {
  console.error('Cannot resolve tsx. Run `npm ci` to install the pinned devDependency.')
  process.exit(1)
}
if (!useLocal) console.warn('warning: node_modules/.bin/tsx missing, falling back to npx. Run `npm ci`.\n')

console.log(`Running ${files.length} test file${files.length === 1 ? '' : 's'} with tsx ${probe.stdout.trim().split('\n')[0]}\n`)

const failures = []
let assertions = 0
const started = Date.now()

for (const file of files) {
  const t0 = Date.now()
  const run = spawnSync(runner, [...prefix, file], { encoding: 'utf8' })
  const ms = Date.now() - t0
  const output = `${run.stdout || ''}${run.stderr || ''}`
  // Test files print their own "N tests passed" summary line.
  const counted = output.match(/(\d+)\s+tests?\s+passed/i)
  if (counted) assertions += Number(counted[1])

  if (run.status === 0) {
    console.log(`  PASS  ${file}  ${counted ? counted[1] + ' tests' : ''}  (${ms}ms)`)
  } else {
    console.log(`  FAIL  ${file}  (${ms}ms)`)
    failures.push({ file, output })
  }
}

console.log(`\n${'-'.repeat(64)}`)
console.log(`  ${files.length - failures.length}/${files.length} files passed, ${assertions} assertions, ${Date.now() - started}ms`)

if (failures.length) {
  console.log(`\n${failures.length} FAILING FILE${failures.length === 1 ? '' : 'S'}:\n`)
  for (const f of failures) {
    console.log(`${'='.repeat(64)}\n${f.file}\n${'='.repeat(64)}`)
    console.log(f.output.trimEnd())
    console.log()
  }
  process.exit(1)
}
process.exit(0)
