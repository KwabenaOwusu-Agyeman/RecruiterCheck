# MyRecruiterCheck Browser Extension (V1)

Captures the job posting the user is currently viewing (LinkedIn, Indeed, or
a generic company career page) and sends it into their MyRecruiterCheck
account, pre-filling New Check. No CV handling, no job tracking, no
background scraping — see the main repo conversation history / PR
description for full V1 scope and constraints.

## Build

```bash
npm install
npm run typecheck
npm run build
```

Output goes to `dist/`.

## Load unpacked in Chrome (local development)

1. `npm run build`
2. Open `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**, select the `dist/` folder
5. Pin the MyRecruiterCheck icon to the toolbar for easy access

Reload the extension (the circular arrow icon on its card in
`chrome://extensions`) after every rebuild.

## Architecture

```
src/
  config.ts              Supabase URL/anon key, web app URL (public, safe to embed)
  shared/types.ts         JobCapture, CaptureResult — no browser APIs, portable
  capture/                 Pure extraction logic (DOM in, JobCapture out). No chrome.* APIs.
    detect.ts               hostname -> linkedin | indeed | other
    jsonld.ts                JSON-LD JobPosting parsing (priority signal)
    confidence.ts            explainable multi-signal scoring
    extractors/
      linkedin.ts
      indeed.ts
      generic.ts             JSON-LD -> semantic containers -> largest plausible block
    index.ts                 orchestrates detect -> extractor -> confidence
  content/contentScript.ts  Injected on-demand only; runs capture(), stores result on window
  background/                The only place chrome.identity/scripting/storage/Supabase are touched
    storageAdapter.ts        chrome.storage.local <-> Supabase SupportedStorage (the one
                              browser-specific file in the auth/session layer)
    supabaseClient.ts        Extension's own independent Supabase client + session
    auth.ts                  Connect/disconnect flow
    api.ts                   submit-job-capture call
    analytics.ts              privacy-conscious event tracking
    background.ts             message router (popup <-> everything else)
  popup/                     Vanilla TS/HTML/CSS UI, no framework
```

`capture/` has zero dependency on `chrome.*` — it's a pure function of
`(hostname, Document, url)` and is the only piece that would need porting
for a non-Chromium engine (see "Safari" below).

## Cross-browser portability

Chrome is the only V1 target. Everything outside `background/storageAdapter.ts`
and the manifest already uses only `chrome.*` APIs that Edge, Brave, and Arc
implement identically (they're all Chromium-based and support the same MV3
extension APIs), so this same `dist/` build should load as-is in Edge/Brave/Arc
via their own "load unpacked" / Chrome Web Store install paths — this hasn't
been tested against those browsers specifically. No code changes are
anticipated to be required.

**Safari** would need real work, not just a repackage:
- Safari Web Extensions require an Xcode-wrapped native app shell (via
  `safari-web-extension-converter`), a different build/signing/notarization
  pipeline, and Apple Developer Program enrollment.
- `chrome.identity.launchWebAuthFlow` has no direct Safari equivalent —
  the connect flow would need `ASWebAuthenticationSession` via the native
  wrapper, called from Swift, not from the extension's own JS.
- `chrome.scripting.executeScript` has a Safari equivalent under the
  `browser.*` namespace (Safari supports much of the WebExtensions API),
  but MV3 support and exact permission semantics differ and would need
  dedicated testing.
- None of `capture/` (the extraction logic) would need to change — that's
  the whole reason it has zero `chrome.*` dependency.

## Environment

The Supabase URL and anon key in `src/config.ts` are public, RLS-constrained
values (the same ones already shipped in the main web app's bundle) — safe
to commit. No secrets live in this package.
