// Run with: npx tsx supabase/functions/_shared/storage-cleanup.test.ts
import assert from 'node:assert/strict'
import {
  isCvObjectForCheck,
  listCheckCvPaths,
  listFolderRecursive,
  removeFolder,
  removePaths,
  type StorageBucketApi,
  type StorageEntry,
} from './storage-cleanup.ts'

let passed = 0
async function test(name: string, fn: () => Promise<void> | void) {
  await fn()
  passed += 1
  console.log(`ok - ${name}`)
}

// An in-memory bucket that behaves like Storage's list: one level at a time,
// sub-folders returned as entries with a null id, `search` as a name prefix.
function fakeBucket(keys: string[], options: { failRemove?: boolean; failList?: boolean } = {}) {
  const objects = new Set(keys)
  const removed: string[][] = []
  const bucket: StorageBucketApi = {
    async list(path, opts = {}) {
      if (options.failList) return { data: null, error: { message: 'list failed' } }
      const prefix = `${path}/`
      const seen = new Map<string, StorageEntry>()
      for (const key of [...objects].sort()) {
        if (!key.startsWith(prefix)) continue
        const rest = key.slice(prefix.length)
        const [head, ...tail] = rest.split('/')
        if (opts.search && !head.startsWith(opts.search)) continue
        if (!seen.has(head)) seen.set(head, { name: head, id: tail.length ? null : `id-${key}` })
      }
      const all = [...seen.values()]
      const offset = opts.offset ?? 0
      return { data: all.slice(offset, offset + (opts.limit ?? 100)), error: null }
    },
    async remove(paths) {
      if (options.failRemove) return { data: null, error: { message: 'remove failed' } }
      removed.push(paths)
      paths.forEach((p) => objects.delete(p))
      return { data: paths, error: null }
    },
  }
  return { bucket, objects, removed }
}

const user = '00000000-0000-0000-0000-0000000000aa'
const checkA = '11111111-0000-0000-0000-00000000000a'
const checkB = '11111111-0000-0000-0000-00000000000b'

await test('isCvObjectForCheck matches the original upload and every autosave version only', () => {
  assert.equal(isCvObjectForCheck(`${checkA}.pdf`, checkA), true)
  assert.equal(isCvObjectForCheck(`${checkA}-1726000000000.txt`, checkA), true)
  assert.equal(isCvObjectForCheck(`${checkB}.pdf`, checkA), false)
  assert.equal(isCvObjectForCheck(`${checkA}x.pdf`, checkA), false)
})

await test('listCheckCvPaths finds every version of one check and nothing else', async () => {
  const { bucket } = fakeBucket([
    `${user}/${checkA}.txt`,
    `${user}/${checkA}-1726000000001.txt`,
    `${user}/${checkA}-1726000000002.txt`,
    `${user}/${checkB}.pdf`,
    `00000000-0000-0000-0000-0000000000bb/${checkA}.pdf`,
  ])
  const { paths, error } = await listCheckCvPaths(bucket, user, checkA)
  assert.equal(error, null)
  assert.deepEqual(paths.sort(), [
    `${user}/${checkA}-1726000000001.txt`,
    `${user}/${checkA}-1726000000002.txt`,
    `${user}/${checkA}.txt`,
  ])
})

await test('listFolderRecursive walks the documents layout <user>/<check>/<file>', async () => {
  const { bucket } = fakeBucket([
    `${user}/${checkA}/CV.pdf`,
    `${user}/${checkA}/Documents.zip`,
    `${user}/${checkB}/Cover Letter.pdf`,
    `00000000-0000-0000-0000-0000000000bb/${checkA}/CV.pdf`,
  ])
  const { paths, error } = await listFolderRecursive(bucket, user)
  assert.equal(error, null)
  assert.deepEqual(paths.sort(), [`${user}/${checkA}/CV.pdf`, `${user}/${checkA}/Documents.zip`, `${user}/${checkB}/Cover Letter.pdf`])
})

await test("removeFolder empties the user's folder and leaves other users alone", async () => {
  const other = `00000000-0000-0000-0000-0000000000bb/${checkA}.pdf`
  const { bucket, objects } = fakeBucket([`${user}/${checkA}.pdf`, `${user}/${checkA}-1.txt`, `${user}/${checkB}.pdf`, other])
  assert.equal(await removeFolder(bucket, user), null)
  assert.deepEqual([...objects], [other])
})

await test('removePaths batches large removals and reports a failure', async () => {
  const keys = Array.from({ length: 250 }, (_, i) => `${user}/${checkA}-${i}.txt`)
  const { bucket, removed } = fakeBucket(keys)
  assert.equal(await removePaths(bucket, keys), null)
  assert.deepEqual(removed.map((batch) => batch.length), [100, 100, 50])
  const failing = fakeBucket(keys, { failRemove: true })
  assert.equal(await removePaths(failing.bucket, keys), 'remove failed')
})

await test('a list failure is reported, never treated as an empty folder', async () => {
  const { bucket } = fakeBucket([`${user}/${checkA}.pdf`], { failList: true })
  assert.equal(await removeFolder(bucket, user), 'list failed')
  assert.equal((await listCheckCvPaths(bucket, user, checkA)).error, 'list failed')
})

await test('listing pages through more than one page of results', async () => {
  const keys = Array.from({ length: 1500 }, (_, i) => `${user}/${checkA}-${String(i).padStart(4, '0')}.txt`)
  const { bucket } = fakeBucket(keys)
  const { paths, error } = await listCheckCvPaths(bucket, user, checkA)
  assert.equal(error, null)
  assert.equal(paths.length, 1500)
})

console.log(`\n${passed} tests passed`)
