import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
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
