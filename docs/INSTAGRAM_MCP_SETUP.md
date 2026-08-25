# Instagram MCP integration — setup guide

Lets Claude publish to the MyRecruiterCheck Instagram Professional account through
Meta's official **Instagram API with Instagram Login** (no Metricool, no browser
automation, no password). Built as Supabase edge functions, matching the rest of
this repo's backend.

Everything below marked **[YOU]** must be done by you in a browser — an agent
cannot complete Meta's account linking or generate secrets on your behalf.
Everything marked **[DONE]** is already implemented in this branch.

## What was built

| File | Purpose |
|---|---|
| `supabase/migrations/20260822120000_instagram_integration.sql` | `instagram_connection` (single-row token store) + `instagram_audit_log`, both service-role-only |
| `supabase/migrations/20260822130000_instagram_refresh_token_cron.sql` | Daily cron to refresh the long-lived token |
| `supabase/functions/_shared/instagram-client.ts` | Graph API wrapper + input validation |
| `supabase/functions/_shared/signed-state.ts` | CSRF-safe OAuth `state` signing |
| `supabase/functions/instagram-oauth-start/` | Builds the Meta authorize URL |
| `supabase/functions/instagram-oauth-callback/` | Exchanges the code, stores the token |
| `supabase/functions/instagram-refresh-token/` | Refreshes the token before it expires |
| `supabase/functions/instagram-mcp/` | The remote MCP server (9 tools) |

Tests: `*.test.ts` next to each module, run with `npx tsx <file>`.

## 1. [YOU] Create the Meta App and add Instagram

1. Go to <https://developers.facebook.com/apps> → **Create App** → type **Other** → **Business**.
2. In the app dashboard, **Add Product** → **Instagram** → choose **API setup with Instagram login** (this is "Instagram API with Instagram Login" — it does **not** require a linked Facebook Page).
3. Under that product's setup page, click **Add account** and log in with the MyRecruiterCheck Instagram Professional account. If the account isn't already a Business/Creator account, Instagram will prompt you to convert it first — do that inside the Instagram app.
4. In **App settings → Basic**, note the **App ID** (not secret) and generate/copy the **App Secret** (secret — see step 3 below for where it goes).
5. Under the Instagram product's **API setup with Instagram login** page, add a redirect URI:
   `https://<your-project-ref>.supabase.co/functions/v1/instagram-oauth-callback`
6. Confirm the requested permissions are `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_insights`. While the app is in Development mode, only accounts added as testers/admins in the App Roles page can authorize it — that's fine, it's just you.

## 2. [YOU] Generate two random secrets

Run this twice locally (do not send the output to me — save both values yourself):

```bash
openssl rand -hex 32
```

- First value → `INSTAGRAM_ADMIN_TOKEN` (gates the OAuth-start link)
- Second value → `INSTAGRAM_STATE_SECRET` (signs the OAuth CSRF state)

Generate a third the same way for `MCP_SERVER_TOKEN` (the bearer token Claude will send).

## 3. [YOU] Set Supabase secrets

Supabase dashboard → your project → **Edge Functions → Secrets** (or `supabase secrets set` via CLI). Set:

```
INSTAGRAM_APP_ID=<from step 1>
INSTAGRAM_APP_SECRET=<from step 1 — paste directly into the Supabase dashboard, never into chat>
INSTAGRAM_OAUTH_REDIRECT_URI=https://<your-project-ref>.supabase.co/functions/v1/instagram-oauth-callback
INSTAGRAM_ADMIN_TOKEN=<from step 2>
INSTAGRAM_STATE_SECRET=<from step 2>
MCP_SERVER_TOKEN=<from step 2>
GRAPH_API_VERSION=<current version — check https://developers.facebook.com/docs/graph-api/changelog>
INSTAGRAM_TEST_MODE=true
```

Leave `INSTAGRAM_TEST_MODE=true` until you've verified the whole flow (step 6).

Also run once in the Supabase SQL editor, if not already done for the existing
upload-purge cron job (harmless if it already exists):

```sql
select vault.create_secret('<your service_role key, from Project Settings > API>', 'service_role_key');
```

## 4. [DONE] Deploy (needs your explicit go-ahead — not run yet)

```bash
supabase db push
supabase functions deploy instagram-oauth-start
supabase functions deploy instagram-oauth-callback
supabase functions deploy instagram-refresh-token
supabase functions deploy instagram-mcp
```

I have not run these. Say the word when you want them deployed.

## 5. [YOU] Connect the account

Once deployed and secrets are set, open in your browser (this is *your* private
link — don't share it):

```
https://<your-project-ref>.supabase.co/functions/v1/instagram-oauth-start?admin_token=<INSTAGRAM_ADMIN_TOKEN>
```

Approve on Instagram's consent screen. You'll land on a plain page saying
"Connected to Instagram as @...". That's it — the token is now stored server-side
and auto-refreshes daily.

## 6. Verify in test mode first

With `INSTAGRAM_TEST_MODE=true`, every `instagram_create_*` tool still validates
the caption, fetches and checks the real media URL, checks your publishing quota,
and creates a real (harmless) media *container* — but stops before the final
"publish" call and returns a simulated result labeled `"testMode": true`. Use this
to confirm the whole pipeline works before risking a real post. Read-only tools
(`instagram_get_account`, `instagram_list_recent_posts`, etc.) always hit the real
API since they can't publish anything.

Only after you've watched a full test-mode run succeed should you flip
`INSTAGRAM_TEST_MODE` to `false` in Supabase secrets.

## 7. Connect the MCP server to Claude

In Claude's remote MCP connector settings, add a connector:

- **URL**: `https://<your-project-ref>.supabase.co/functions/v1/instagram-mcp`
- **Authentication**: custom header `Authorization: Bearer <MCP_SERVER_TOKEN>`

Claude will discover the 9 tools (`instagram_get_account`,
`instagram_create_image_post`, `instagram_create_carousel`,
`instagram_create_reel`, `instagram_create_story`, `instagram_get_publish_status`,
`instagram_list_recent_posts`, `instagram_get_post_insights`,
`instagram_get_publishing_limit`). Every `instagram_create_*` tool requires
`confirm: true` — its description tells Claude to show you the exact caption and
media first and only pass `confirm: true` after you explicitly approve it. Never
set that yourself in a prompt; let Claude ask you.

## Notes / limitations

- Single Instagram account only — the connection table is a single row by design.
- No liking, following, bulk commenting, or DMs are implemented, and none are planned.
- Every tool call (success, error, or rejected-for-no-confirmation) is written to
  `instagram_audit_log`. Captions/URLs may appear there; access tokens never do.
- Graph API versions change often — `GRAPH_API_VERSION` has no code default on
  purpose, so an expired assumption can't silently ship. Re-check the changelog
  periodically.
