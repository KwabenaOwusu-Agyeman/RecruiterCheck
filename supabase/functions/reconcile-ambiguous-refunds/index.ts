// Cron-invoked reconciler. Resolves refund_events left 'pending' by
// request-refund's ambiguous-failure path: queries Stripe directly (which
// the database-only reconciler cannot do) and finalizes/fails ONLY on
// definitive Stripe state.
//
// Provenance: this function was deployed to production on 2026-08-28 from
// the archived review/part_a_v3 work and lived only there until 2026-09-03,
// when its deployed source was brought into the repo unchanged so it is
// versioned, tested and deployed by the workflow like every other function.
// It is NOT scheduled: the pg_cron job that would call it (see
// review/part_a_v3/04_scheduler_migration.sql, "REVIEW ONLY, NOT APPLIED")
// was never applied, and CRON_INVOKE_SECRET is not set in production, so
// every request currently gets 503 from the fail closed check below.
// Activating it is a separate decision: a committed cron migration plus the
// secret, both Level 3.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import Stripe from 'npm:stripe@17.5.0'

Deno.serve(async (req) => {
  // Fail CLOSED: a missing CRON_INVOKE_SECRET must reject the request, not
  // silently skip authentication. (A previous `cronSecret && ...` form was
  // fail-open -- if the secret was unset the check short-circuited and this
  // refund-mutating endpoint became publicly callable.)
  const cronSecret = Deno.env.get('CRON_INVOKE_SECRET')
  if (!cronSecret) {
    console.error(
      'reconcile-ambiguous-refunds: CRON_INVOKE_SECRET is not configured',
    )
    return new Response('Not configured', { status: 503 })
  }
  if (req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!stripeSecretKey) {
    return new Response('Billing is not configured', { status: 503 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2024-12-18.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  })

  const { data: candidates, error } = await adminClient.rpc(
    'list_ambiguous_refund_candidates',
  )
  if (error) {
    console.error(
      'reconcile-ambiguous-refunds: could not list candidates',
      error,
    )
    return new Response('Internal error', { status: 500 })
  }

  let resolved = 0
  let stillAmbiguous = 0

  for (const candidate of candidates ?? []) {
    const {
      refund_event_id: refundEventId,
      stripe_payment_intent_id: paymentIntentId,
    } = candidate as {
      refund_event_id: string
      stripe_payment_intent_id: string
    }

    try {
      const refunds = await stripe.refunds.list({
        payment_intent: paymentIntentId,
        limit: 5,
      })
      const succeeded = refunds.data.find((r) => r.status === 'succeeded')
      if (succeeded) {
        await adminClient.rpc('finalize_refund', {
          p_refund_event_id: refundEventId,
          p_stripe_refund_id: succeeded.id,
        })
        resolved += 1
        continue
      }
      const allFailed = refunds.data.length > 0 &&
        refunds.data.every((r) =>
          r.status === 'failed' || r.status === 'canceled'
        )
      if (allFailed) {
        await adminClient.rpc('fail_refund', {
          p_refund_event_id: refundEventId,
        })
        resolved += 1
        continue
      }
      // No refund object exists yet AND no pending/requires_action one
      // either -- still cannot definitively determine whether the original
      // refunds.create call ever reached Stripe. Left pending for the next
      // pass; never guessed at.
      stillAmbiguous += 1
    } catch (err) {
      console.error(
        'reconcile-ambiguous-refunds: Stripe lookup failed for',
        paymentIntentId,
        err instanceof Error ? err.message : String(err),
      )
      stillAmbiguous += 1
    }
  }

  return new Response(
    JSON.stringify({
      resolved,
      stillAmbiguous,
      totalCandidates: candidates?.length ?? 0,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  )
})
