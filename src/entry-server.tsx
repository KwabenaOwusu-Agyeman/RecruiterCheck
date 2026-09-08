/* eslint-disable react-refresh/only-export-components --
   Fast Refresh is a dev server concern for modules in the CLIENT graph. This is
   the SSR entry: it is never hot reloaded, and the non component exports below
   exist precisely so the build scripts, which are plain .mjs and cannot import
   TypeScript, read one definition of the route set instead of keeping copies. */
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
// react-router v7 merged the server entry back into react-router; the
// react-router-dom/server subpath no longer exists.
import { StaticRouter } from 'react-router'
import { AppRoutes } from '@/App'
import { AuthProvider } from '@/hooks/useAuth'
import { getSsrMeta, resetSsrMeta } from '@/hooks/usePageMeta'
import { contentIndex, itemByPath, publishedRoutes } from '@/content/load'
import { setContentProvider } from '@/content/runtime'
import { STATIC_ROUTES, staticRoutePaths } from '@/routes/static-routes'

// Only the server bundle imports load.ts, so only the server bundle inlines the
// content files. The browser reads its item from the JSON the prerender embeds.
setContentProvider(itemByPath)

// Re-exported so scripts/prerender.mjs and scripts/build-sitemap.mjs, which are
// plain .mjs and cannot import TypeScript, still read one definition of the
// route set rather than keeping their own copies.
export { contentIndex, publishedRoutes, STATIC_ROUTES, staticRoutePaths }

export function render(url: string) {
  resetSsrMeta()

  const html = renderToString(
    <StrictMode>
      <AuthProvider>
        <StaticRouter location={url}>
          <AppRoutes />
        </StaticRouter>
      </AuthProvider>
    </StrictMode>,
  )

  return { html, meta: getSsrMeta() }
}
