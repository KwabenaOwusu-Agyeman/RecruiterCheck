// Deno script — permanently deletes a fixed list of test users and every
// piece of associated data (DB rows + Storage files) so their emails can
// register again as brand-new users eligible for exactly one free check.
//
// Run with (service role key must NEVER be used in frontend/app code):
//
//   SUPABASE_URL=https://<project>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
//   deno run --allow-net --allow-env scripts/reset-test-users.ts --dry-run
//
// Nothing is deleted until you pass --confirm as well as removing --dry-run:
//
//   ... deno run --allow-net --allow-env scripts/reset-test-users.ts --confirm
//
// Add --include-newsletter to also purge matching rows from
// newsletter_subscribers (that table is keyed by email, not user_id, and is
// NOT touched otherwise since it isn't part of the free-check gate).
//
// This script only deletes rows/objects. It creates no tables, policies,
// functions, or config, and changes none.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

// --- EDIT THIS LIST: exact emails to reset. Nothing outside this list is touched. ---
const TARGET_EMAILS: string[] = [
  'fullcircle.ai@gmail.com',
  'pyeboah450@gmail.com',
  'dennis@abraham-reynolds.com',
  'kinetaagyemang@gmail.com',
  'abenaagyeman00@gmail.com',
  'kwabenaoagyeman@gmail.com',
  'gadjei450@gmail.com',
  'victory.aiagency@gmail.com',
  'rendezvous.booth@gmail.com',
  'hilu1954@gmail.com',
  'hirenbhatt1105@gmail.com',
  'rish19abh@gmail.com',
]
// --------------------------------------------------------------------------

const args = new Set(Deno.args)
const DRY_RUN = !args.has('--confirm') || args.has('--dry-run')
const INCLUDE_NEWSLETTER = args.has('--include-newsletter')

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.')
  Deno.exit(1)
}

if (TARGET_EMAILS.length === 0) {
  console.error('TARGET_EMAILS is empty — edit the script and list the exact emails to reset.')
  Deno.exit(1)
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function findUserByEmail(email: string) {
  // admin.listUsers has no email filter in this SDK version; page through
  // until found. Test-user lists are small, so this is fine as written —
  // if you ever run this against thousands of users, filter server-side
  // instead.
  let page = 1
  const perPage = 200
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (match) return match
    if (data.users.length < perPage) return null
    page += 1
  }
}

async function removeStorageForUser(userId: string) {
  // cvs/{userId}/*
  const { data: cvFiles, error: cvListError } = await admin.storage.from('cvs').list(userId)
  if (cvListError) throw cvListError
  if (cvFiles && cvFiles.length > 0) {
    const paths = cvFiles.map((f) => `${userId}/${f.name}`)
    console.log(`  storage: deleting ${paths.length} file(s) from cvs/${userId}/`)
    if (!DRY_RUN) {
      const { error } = await admin.storage.from('cvs').remove(paths)
      if (error) throw error
    }
  }

  // documents/{userId}/{checkId}/* — one level deeper, so list checkId
  // subfolders first, then list+remove files inside each.
  const { data: checkFolders, error: docListError } = await admin.storage
    .from('documents')
    .list(userId)
  if (docListError) throw docListError
  for (const folder of checkFolders ?? []) {
    const prefix = `${userId}/${folder.name}`
    const { data: files, error: innerListError } = await admin.storage.from('documents').list(prefix)
    if (innerListError) throw innerListError
    if (files && files.length > 0) {
      const paths = files.map((f) => `${prefix}/${f.name}`)
      console.log(`  storage: deleting ${paths.length} file(s) from documents/${prefix}/`)
      if (!DRY_RUN) {
        const { error } = await admin.storage.from('documents').remove(paths)
        if (error) throw error
      }
    }
  }
}

async function sweepRateLimitEvents(userId: string) {
  console.log(`  db: sweeping rate_limit_events for ${userId}`)
  if (!DRY_RUN) {
    const { error } = await admin.from('rate_limit_events').delete().eq('user_id', userId)
    if (error) throw error
  }
}

async function deleteAuthUser(userId: string) {
  console.log(`  auth: deleting auth.users row ${userId} (cascades profiles → checks → feedback,`)
  console.log(`        check_sentiment, credit_batches, check_ledger, analyze_requests,`)
  console.log(`        analytics_events, job_captures, extension_connect_codes, product_feedback)`)
  if (!DRY_RUN) {
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) throw error
  }
}

async function removeNewsletterSubscriber(email: string) {
  console.log(`  db: deleting newsletter_subscribers row for ${email}`)
  if (!DRY_RUN) {
    const { error } = await admin.from('newsletter_subscribers').delete().eq('email', email.toLowerCase())
    if (error) throw error
  }
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (no changes will be made) ===' : '=== LIVE RUN — DELETING DATA ===')
  console.log(`Targets: ${TARGET_EMAILS.join(', ')}`)
  console.log('')

  for (const email of TARGET_EMAILS) {
    console.log(`--- ${email} ---`)
    const user = await findUserByEmail(email)

    if (!user) {
      console.log('  no matching auth user found — skipping account/DB/storage deletion for this email')
    } else {
      console.log(`  found auth user ${user.id}`)
      await removeStorageForUser(user.id)
      await sweepRateLimitEvents(user.id)
      await deleteAuthUser(user.id)
    }

    if (INCLUDE_NEWSLETTER) {
      await removeNewsletterSubscriber(email)
    }

    console.log('')
  }

  console.log(DRY_RUN ? 'Dry run complete. Re-run with --confirm to actually delete.' : 'Done.')
}

await main()
