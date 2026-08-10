import { build } from 'esbuild'
import { cpSync, mkdirSync, rmSync } from 'node:fs'

const outdir = 'dist'

rmSync(outdir, { recursive: true, force: true })
mkdirSync(outdir, { recursive: true })

// background.js (declared "type": "module" in manifest.json) and popup.js
// (loaded via <script type="module">) can use ESM output. contentScript.js
// is injected via chrome.scripting.executeScript({ files: [...] }), which
// runs as a classic script — an ESM `export` statement in that file would
// throw, so it's built separately as a self-contained IIFE.
await build({
  entryPoints: {
    background: 'src/background/background.ts',
    popup: 'src/popup/popup.ts',
  },
  bundle: true,
  outdir,
  format: 'esm',
  target: 'es2022',
  tsconfig: './tsconfig.json',
  logLevel: 'info',
})

await build({
  entryPoints: { contentScript: 'src/content/contentScript.ts' },
  bundle: true,
  outdir,
  format: 'iife',
  target: 'es2022',
  tsconfig: './tsconfig.json',
  logLevel: 'info',
})

cpSync('manifest.json', `${outdir}/manifest.json`)
cpSync('src/popup/popup.html', `${outdir}/popup.html`)
cpSync('src/popup/popup.css', `${outdir}/popup.css`)
cpSync('icons', `${outdir}/icons`, { recursive: true })

console.log('Extension built to dist/')
