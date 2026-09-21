// Every candidate file lives under a folder named after its owner:
// cvs/<userId>/<checkId>.<ext> and documents/<userId>/<checkId>/...
//
// checks.cv_storage_path was client-writable until migration
// 20260921120000, and the functions that read or delete it do so with the
// service role, which ignores Storage policies. Checking the prefix here
// means a row that points outside its owner's folder can never make the
// service role read or delete another user's file, whatever the database
// allows.

export function isOwnStoragePath(path: unknown, userId: string): path is string {
  if (typeof path !== 'string' || !userId) return false
  const prefix = `${userId}/`
  if (!path.startsWith(prefix) || path.length === prefix.length) return false
  // No traversal or empty segments: Storage keys are opaque, but a path that
  // only looks like it is inside the folder is still refused.
  return !path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
}

// The file's extension, for logs. File names often contain the candidate's
// name, so they are never logged in full.
export function fileExtensionForLog(fileName: unknown): string {
  if (typeof fileName !== 'string') return 'unknown'
  const match = /\.([a-z0-9]{1,8})$/i.exec(fileName)
  return match ? match[1].toLowerCase() : 'none'
}
