# Chrome Web Store Submission Audit — MyRecruiterCheck Job Capture

Date: 2026-08-28
Extension version: 0.1.0 (unchanged — no fixes were required)
Auditor: Claude Code, acting as senior Chrome extension engineer

## Scope

Full audit of `recruitercheck-extension/` ahead of its first Chrome Web Store
submission, plus the website-side auth/CORS/redirect surface it depends on.
No code was deployed, published, uploaded, or submitted as part of this audit.

## Files changed

**None.** The extension source was already correct on every point in scope:

- No references to `recruitercheck.vercel.app`, `myrecruitercheck.vercel.app`,
  `localhost`, `127.0.0.1`, or any preview-deployment host exist anywhere in
  `recruitercheck-extension/` (source, `dist/`, or the previous zip).
- `src/config.ts` already targets `https://myrecruitercheck.com` and the
  correct Supabase project.
- `manifest.json` permissions were already least-privilege.

`dist/` was rebuilt from a clean state and the ZIP was regenerated from that
build for a verifiable, reproducible artifact — no source edits were made.

## Old URLs removed

None found. See "Files changed" above.

## Final permissions and justification

| Permission | Justification |
|---|---|
| `storage` | Persists the extension's own Supabase session (`chrome.storage.local`, via `src/background/storageAdapter.ts`) — independent of the web app's session, no cross-origin storage reads. |
| `activeTab` | Grants access only to the tab the user explicitly invoked the extension on, only for that invocation — not a persistent grant. |
| `scripting` | Injects `contentScript.js` on demand via `chrome.scripting.executeScript` when the user clicks "Capture this job." No `content_scripts` entry in the manifest — the script never runs on page load or without an explicit user action. |
| `identity` | `chrome.identity.launchWebAuthFlow` + `getRedirectURL` for the one-time "Connect MyRecruiterCheck" handshake. |

No `host_permissions` and no `externally_connectable` are declared — none are
needed, since network calls go through `fetch`/Supabase client from the
service worker to endpoints that already return permissive CORS headers, and
the auth handoff runs through `chrome.identity`'s own browser-owned flow.

No custom Content-Security-Policy is set in the manifest, so the extension
inherits MV3's strict default (`script-src 'self'; object-src 'self'`) —
remote code execution is already disallowed by the platform default.

## User-data handling

- **Captured data**: job title, company name, job description, job URL, and a
  coarse source bucket (`linkedin` / `indeed` / `other`) — extracted only from
  the page's own job-posting content (JSON-LD `JobPosting` first, then a
  narrow set of known DOM containers, then a generic largest-content-block
  fallback that explicitly excludes nav/footer/ads/related-jobs).
- **Never captured**: the viewer's own profile, feed, connections, messages,
  or any personal browsing data — the LinkedIn/Indeed extractors' selectors
  are scoped only to the job-posting region and never touch those other DOM
  subtrees.
- **Server-side retention**: captured jobs land in the `job_captures` table
  with `expires_at` defaulting to 48 hours from insert, enforced by a
  scheduled cleanup job that deletes expired rows — matches the description
  on [myrecruitercheck.com/privacy](https://myrecruitercheck.com/privacy)
  (Section 14, "Browser Extension") exactly; this was checked against the
  actual migration SQL, not just the page copy.
- **Analytics**: only `event_type` and the coarse source bucket are recorded
  (`src/background/analytics.ts`) — never job description, CV content, URLs,
  or auth tokens.
- **Auth**: the extension never sees the user's password, never reads the web
  app's cookies/localStorage, and holds its own independent Supabase session
  established via a single-use, short-lived, server-issued code exchanged for
  a magic-link token — not a copied session.
- **Secrets**: only the Supabase anon key is embedded in `config.ts`. It is
  public and RLS-constrained by design (the same key already shipped in the
  main web app's bundle) — not a credential that grants elevated access.

## Website-side findings (reported separately, per audit instructions — no production changes made or proposed)

- `src/pages/ExtensionConnectPage.tsx` validates the extension's redirect
  target is `https:` and ends in `.chromiumapp.org` before navigating —
  cannot be used as an open redirect to an arbitrary origin.
- `create-extension-connect-code` (called by the web app, not the extension)
  has CORS locked to `https://myrecruitercheck.com` exactly.
- `exchange-extension-connect-code` and `submit-job-capture` (called by the
  extension) use wildcard CORS, but both require a real credential (a
  single-use short-lived code, or a Bearer token) as the actual gate — safe
  because there's no ambient/cookie-based auth an attacker's page could ride
  on for either endpoint.
- `manifest.json` has no `"key"` field, so the extension ID will differ
  between an unpacked dev load and the ID Chrome assigns on publishing.
  Nothing server-side hardcodes a specific extension ID — the redirect check
  above is suffix-based — so this has no functional impact now or after
  publishing.
- **Conclusion: no website, CORS, CSP, or Supabase redirect configuration
  changes are needed.** The current setup already targets the right domain
  and is extension-ID-agnostic.

## Tests performed and results

| Test | Result |
|---|---|
| `npm run build` (clean rebuild from source) | ✅ Passed — `dist/background.js`, `dist/popup.js`, `dist/contentScript.js` built without errors |
| `npm run typecheck` (`tsc --noEmit`) | ✅ Passed — no type errors |
| Manual code trace of every popup state transition (`not_connected → connecting → ready → capturing → preview → submitting → submitted`, and every error branch: connect failure, low-confidence/no-description capture, unauthorized/expired session with reconnect prompt) | ✅ Traced against `src/popup/popup.ts` and `src/background/background.ts` — all branches handled, no dead ends, no unhandled promise rejections |
| Static search for `eval`, remote script loading, hardcoded secrets, old-domain references | ✅ None found |
| Live end-to-end test (load unpacked → connect real account → capture a real LinkedIn/Indeed posting → confirm session + prefill) | ⚠️ **Not performed** — deferred per explicit choice: skip live testing and produce the ZIP/report now, with this flagged as an unresolved risk for verification before actual Chrome Web Store submission |

## Unresolved risks

1. **No live end-to-end test yet.** Everything above is static/code-level
   verification. Before actually submitting to the Chrome Web Store, load
   `dist/` unpacked in Chrome (`chrome://extensions` → Developer mode → "Load
   unpacked") and confirm: connect succeeds against a real signed-in session,
   a real LinkedIn and a real Indeed job posting both capture correctly, the
   "Check this job" button opens `myrecruitercheck.com/checks/new` with the
   job prefilled, and the session survives a popup close/reopen.
2. **No fixed `manifest.json` `"key"` field.** Optional — only affects
   extension-ID stability across repeated unpacked dev loads, not correctness
   or security. Not required to submit.
3. **Chrome Web Store listing content** (screenshots, promotional images,
   privacy-practices disclosure in the Developer Dashboard, permission
   justifications typed into the store form) is separate from the code audit
   above and still needs to be prepared at submission time.

## ZIP artifact

- **Filename**: `recruitercheck-extension-v0.1.0.zip`
- **SHA-256**: `78732e340567a6f0f5a9d6d719fbb0326346c3d005c054150d6e1b459846201d`
- **Contents**: `manifest.json` at the archive root, plus `background.js`,
  `popup.js`, `popup.html`, `popup.css`, `contentScript.js`, and `icons/`
  (11 files, 760,755 bytes uncompressed) — no source maps, no dev
  dependencies, no `node_modules`, no build tooling.

Not uploaded, submitted, or published anywhere — this ZIP exists only in the
local repository at `recruitercheck-extension/recruitercheck-extension-v0.1.0.zip`.
