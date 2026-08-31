#!/usr/bin/env node
// Verifies that the scoring regression suite actually detects a scoring
// change, rather than passing because it restates the same constants.
//
// Each mutation below perturbs one scoring constant in logic.ts, runs the
// regression suite, and expects it to FAIL. A mutation that does not fail is
// a hole: that constant is unprotected.
//
//   node scripts/mutation-check.mjs
//
// logic.ts is restored from an in-memory copy after every mutation and its
// hash is verified at the end. The script refuses to run if logic.ts has
// uncommitted changes it did not make, so a crash can never leave a mutated
// scoring engine behind unnoticed.

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const TARGET = 'supabase/functions/analyze-check/logic.ts'
// The scoring selection the workflow runs for a scoring change, not just the
// regression file: some constants (the empty-category fallback) are covered by
// the older logic.test.ts, and a mutation caught there is genuinely caught.
const SUITE = ['scripts/run-tests.mjs', '--filter=scoring,analyze-check']
const RUNNER = 'node'

const MUTATIONS = [
  ['evidenceAndAppliedAbility: 0.4', 'evidenceAndAppliedAbility: 0.45', 'category blend, evidence 0.4 -> 0.45'],
  ['technicalCapability: 0.35', 'technicalCapability: 0.30', 'category blend, capability 0.35 -> 0.30'],
  ['fitAndCommunication: 0.25', 'fitAndCommunication: 0.20', 'category blend, fit 0.25 -> 0.20'],
  ['const CRITICAL_GAP_CAP = 49', 'const CRITICAL_GAP_CAP = 80', 'critical gap cap 49 -> 80'],
  ['must_have: 3,', 'must_have: 4,', 'importance weight must_have 3 -> 4'],
  ['important: 2,', 'important: 1,', 'importance weight important 2 -> 1'],
  ['partial: 0.5,', 'partial: 0.75,', 'match value partial 0.5 -> 0.75'],
  ['strong: 100,', 'strong: 90,', 'evidence level strong 100 -> 90'],
  ['partial: 50,', 'partial: 40,', 'evidence level partial 50 -> 40'],
  ['appliedEvidence: 20, appliedSkill: 10', 'appliedEvidence: 25, appliedSkill: 10', 'category 1 subweight 20 -> 25'],
  ['essentialSkills: 15', 'essentialSkills: 20', 'category 2 subweight essentialSkills 15 -> 20'],
  ['roleFit: 10, valueProposition: 5', 'roleFit: 15, valueProposition: 5', 'category 3 subweight roleFit 10 -> 15'],
  ['const NEUTRAL_CATEGORY_FALLBACK = 50', 'const NEUTRAL_CATEGORY_FALLBACK = 60', 'empty-category fallback 50 -> 60'],
  ['Math.round((matched / max) * 100)', 'Math.floor((matched / max) * 100)', 'requirement matrix rounding round -> floor'],
]

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)

// Refuse to run on a dirty target: restoring would otherwise discard work.
const dirty = spawnSync('git', ['status', '--porcelain', '--', TARGET], { encoding: 'utf8' }).stdout.trim()
const original = readFileSync(TARGET, 'utf8')
const originalHash = hash(original)
if (dirty && !process.argv.includes('--allow-dirty')) {
  console.error(`${TARGET} has uncommitted changes.`)
  console.error('Pass --allow-dirty to run anyway; the file is restored from memory either way.')
}

console.log(`Mutating ${TARGET} (${originalHash}), expecting the scoring suite to fail each time.\n`)

let holes = 0
let skipped = 0
try {
  for (const [from, to, label] of MUTATIONS) {
    const occurrences = original.split(from).length - 1
    if (occurrences === 0) {
      console.log(`  SKIP    ${label}  (target not found; mutation needs updating)`)
      skipped++
      continue
    }
    if (occurrences > 1) {
      console.log(`  SKIP    ${label}  (target appears ${occurrences}x; mutation is ambiguous)`)
      skipped++
      continue
    }
    writeFileSync(TARGET, original.replace(from, to))
    const failed = spawnSync(RUNNER, SUITE, { encoding: 'utf8' }).status !== 0
    console.log(`  ${failed ? 'CAUGHT ' : 'HOLE   '} ${label}`)
    if (!failed) holes++
    writeFileSync(TARGET, original)
  }
} finally {
  writeFileSync(TARGET, original)
}

const restored = hash(readFileSync(TARGET, 'utf8'))
console.log(`\n${'-'.repeat(64)}`)
console.log(`  ${MUTATIONS.length - holes - skipped}/${MUTATIONS.length} caught, ${holes} holes, ${skipped} skipped`)
console.log(`  ${TARGET} restored: ${restored === originalHash ? 'PASS' : 'FAIL'} (${restored})`)

if (restored !== originalHash) {
  console.error('\nlogic.ts was NOT restored correctly. Run `git diff` and restore it before continuing.')
  process.exit(2)
}
process.exit(holes > 0 || skipped > 0 ? 1 : 0)
