import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
// react-router v7 merged the server entry back into react-router; the
// react-router-dom/server subpath no longer exists.
import { StaticRouter } from 'react-router'
import { AppRoutes } from '@/App'
import { AuthProvider } from '@/hooks/useAuth'
import { getSsrMeta, resetSsrMeta } from '@/hooks/usePageMeta'

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
