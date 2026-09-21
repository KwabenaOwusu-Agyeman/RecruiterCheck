// Run with: npx tsx supabase/functions/_shared/storage-path.test.ts
import assert from 'node:assert/strict'
import { fileExtensionForLog, isOwnStoragePath } from './storage-path.ts'

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`ok - ${name}`)
}

const owner = '00000000-0000-0000-0000-0000000000aa'
const other = '00000000-0000-0000-0000-0000000000bb'

test('accepts the paths the app writes', () => {
  assert.equal(isOwnStoragePath(`${owner}/11111111-0000-0000-0000-000000000001.pdf`, owner), true)
  assert.equal(isOwnStoragePath(`${owner}/11111111-0000-0000-0000-000000000001-1726000000000.txt`, owner), true)
  assert.equal(isOwnStoragePath(`${owner}/11111111-0000-0000-0000-000000000001/CV.pdf`, owner), true)
})

test("refuses another user's folder", () => {
  assert.equal(isOwnStoragePath(`${other}/11111111-0000-0000-0000-000000000001.pdf`, owner), false)
})

test('refuses a prefix that only starts with the user id', () => {
  assert.equal(isOwnStoragePath(`${owner}x/file.pdf`, owner), false)
  assert.equal(isOwnStoragePath(`${owner}`, owner), false)
  assert.equal(isOwnStoragePath(`${owner}/`, owner), false)
})

test('refuses traversal and empty segments', () => {
  assert.equal(isOwnStoragePath(`${owner}/../${other}/cv.pdf`, owner), false)
  assert.equal(isOwnStoragePath(`${owner}//cv.pdf`, owner), false)
  assert.equal(isOwnStoragePath(`${owner}/./cv.pdf`, owner), false)
})

test('refuses non strings and a missing user id', () => {
  assert.equal(isOwnStoragePath(null, owner), false)
  assert.equal(isOwnStoragePath(undefined, owner), false)
  assert.equal(isOwnStoragePath(42, owner), false)
  assert.equal(isOwnStoragePath(`${owner}/cv.pdf`, ''), false)
})

test('fileExtensionForLog keeps only the extension', () => {
  assert.equal(fileExtensionForLog('Jane_Doe_CV.PDF'), 'pdf')
  assert.equal(fileExtensionForLog('cv.docx'), 'docx')
  assert.equal(fileExtensionForLog('no extension'), 'none')
  assert.equal(fileExtensionForLog(null), 'unknown')
})

console.log(`\n${passed} tests passed`)
