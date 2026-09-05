// Run with: npx tsx admin/src/types/database-parity.test.ts
//
// admin/src/types/database.ts is a committed copy of the public app's
// generated Supabase types, because this app's Vercel root directory is
// admin/ and it cannot import a file above that root at build time.
//
// A copy that silently drifts from the schema is the failure CLAUDE.md
// describes: the compiler agrees with code the database will reject. This test
// makes that drift fail the suite instead. If it fails, run:
//   node admin/scripts/sync-types.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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

const here = dirname(fileURLToPath(import.meta.url))
const canonical = resolve(here, '../../../src/types/database.ts')
const copy = resolve(here, './database.ts')

test('the admin copy of database.ts matches the generated original', () => {
  const original = readFileSync(canonical, 'utf8')
  const mirrored = readFileSync(copy, 'utf8')
  assert.equal(
    mirrored,
    original,
    'admin/src/types/database.ts has drifted. Run: node admin/scripts/sync-types.mjs',
  )
})

console.log(`\n${passed} tests passed`)
