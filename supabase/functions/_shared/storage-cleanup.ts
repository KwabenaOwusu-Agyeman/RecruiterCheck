// Storage removal that finds everything a check or a user left behind.
//
// A draft's CV was re-uploaded to a new path on every replacement and on
// every pasted-text autosave (<userId>/<checkId>-<ms>.<ext>), and only the
// path on the row was ever deleted, so earlier versions outlived the 24 hour
// promise, check deletion and account deletion. These helpers work from the
// folder instead of the row.
//
// Typed against the small part of the Storage client they use, so they run
// under the Deno functions and the Node test runner alike.

export interface StorageEntry {
  name: string
  // Storage lists sub-folders as entries with a null id.
  id: string | null
}

export interface StorageBucketApi {
  list(
    path: string,
    options?: { limit?: number; offset?: number; search?: string },
  ): Promise<{ data: StorageEntry[] | null; error: { message: string } | null }>
  remove(paths: string[]): Promise<{ data: unknown; error: { message: string } | null }>
}

const PAGE_SIZE = 1000
const REMOVE_BATCH = 100
// A user or a check never has anywhere near this many objects; the cap only
// stops a misbehaving list call from looping forever.
const MAX_PAGES = 50

async function listAll(
  bucket: StorageBucketApi,
  folder: string,
  search?: string,
): Promise<{ entries: StorageEntry[]; error: string | null }> {
  const entries: StorageEntry[] = []
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await bucket.list(folder, { limit: PAGE_SIZE, offset: page * PAGE_SIZE, search })
    if (error) return { entries, error: error.message }
    const batch = data ?? []
    entries.push(...batch)
    if (batch.length < PAGE_SIZE) return { entries, error: null }
  }
  return { entries, error: 'too many objects to list' }
}

/** Removes paths in batches. Returns an error message, or null when all were removed. */
export async function removePaths(bucket: StorageBucketApi, paths: string[]): Promise<string | null> {
  for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
    const { error } = await bucket.remove(paths.slice(i, i + REMOVE_BATCH))
    if (error) return error.message
  }
  return null
}

/** Is this object name one of the CV versions stored for this check? */
export function isCvObjectForCheck(name: string, checkId: string): boolean {
  return name.startsWith(`${checkId}.`) || name.startsWith(`${checkId}-`)
}

/** Every CV version stored for a check: <userId>/<checkId>.<ext> and <userId>/<checkId>-<ms>.<ext>. */
export async function listCheckCvPaths(
  cvs: StorageBucketApi,
  userId: string,
  checkId: string,
): Promise<{ paths: string[]; error: string | null }> {
  const { entries, error } = await listAll(cvs, userId, checkId)
  const paths = entries
    .filter((entry) => entry.id !== null && isCvObjectForCheck(entry.name, checkId))
    .map((entry) => `${userId}/${entry.name}`)
  return { paths, error }
}

/** Every object under a folder, however deep. Paths are relative to the bucket. */
export async function listFolderRecursive(
  bucket: StorageBucketApi,
  folder: string,
  depth = 0,
): Promise<{ paths: string[]; error: string | null }> {
  const { entries, error } = await listAll(bucket, folder)
  if (error) return { paths: [], error }
  const paths: string[] = []
  for (const entry of entries) {
    const path = `${folder}/${entry.name}`
    if (entry.id === null) {
      // Storage folders are key prefixes; four levels is more than any
      // layout this app writes (documents/<user>/<check>/<file>).
      if (depth >= 4) return { paths, error: `folder nesting too deep at ${folder}` }
      const nested = await listFolderRecursive(bucket, path, depth + 1)
      if (nested.error) return { paths, error: nested.error }
      paths.push(...nested.paths)
    } else {
      paths.push(path)
    }
  }
  return { paths, error: null }
}

/** Removes everything under a folder. Returns an error message, or null. */
export async function removeFolder(bucket: StorageBucketApi, folder: string): Promise<string | null> {
  const { paths, error } = await listFolderRecursive(bucket, folder)
  if (error) return error
  return removePaths(bucket, paths)
}
