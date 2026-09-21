import { lazy, type ComponentType } from 'react'

const RELOAD_FLAG = 'mrc:chunk-reload'

/**
 * React.lazy for a page's named export, with one recovery step.
 *
 * Every deploy replaces the hashed chunk files, so a tab opened before a
 * deploy asks for chunks that no longer exist the next time it navigates to
 * a lazy page. Reloading once picks up the new build. A second failure in
 * the same tab is a real error and is rethrown to the error boundary, so
 * this can never loop. If sessionStorage is unavailable it rethrows at once
 * rather than risk reloading forever.
 *
 * Only for routes that are never prerendered: a lazy component suspends on
 * the server and during hydration, which would change prerendered markup.
 */
export function lazyPage<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(async () => {
    try {
      const module = await load()
      try {
        sessionStorage.removeItem(RELOAD_FLAG)
      } catch {
        // Storage blocked; nothing to clear.
      }
      return { default: module[name] }
    } catch (error) {
      let alreadyReloaded = true
      try {
        alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === '1'
        if (!alreadyReloaded) sessionStorage.setItem(RELOAD_FLAG, '1')
      } catch {
        alreadyReloaded = true
      }
      if (alreadyReloaded) throw error
      window.location.reload()
      return new Promise<never>(() => {})
    }
  })
}
