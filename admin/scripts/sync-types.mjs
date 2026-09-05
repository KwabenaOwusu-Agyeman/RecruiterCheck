// Copies the public app's generated Supabase types into this app.
//
// The admin project sets its Vercel root directory to admin/, so it cannot
// import ../src/types/database.ts at build time. The file is therefore
// committed here as a copy, and admin/src/types/database-parity.test.ts fails
// if the two ever drift. Regenerating types after a migration means running
// this script too.
//
// Run with: node admin/scripts/sync-types.mjs
import { copyFileSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = resolve(here, '../../src/types/database.ts')
const target = resolve(here, '../src/types/database.ts')

const before = (() => {
  try {
    return readFileSync(target, 'utf8')
  } catch {
    return null
  }
})()

copyFileSync(source, target)

const after = readFileSync(target, 'utf8')
if (before === after) {
  console.log('database.ts already in sync')
} else {
  console.log(`database.ts synced (${after.length} bytes)`)
}
