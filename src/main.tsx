import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

const rootEl = document.getElementById('root')!
const app = (
  <StrictMode>
    <App />
  </StrictMode>
)

// Routes prerendered at build time (see scripts/prerender.mjs) ship with
// markup already inside #root, so hydrate it instead of wiping and
// re-rendering. Client-only routes (e.g. the authenticated app) have an
// empty #root and get a normal client render.
if (rootEl.hasChildNodes()) {
  hydrateRoot(rootEl, app)
} else {
  createRoot(rootEl).render(app)
}
