import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import Stripe from 'npm:stripe@17.5.0'

// Kept in sync with CHECK_PACKS in src/lib/constants.ts and PACKS in
// create-checkout-session, per this codebase's existing convention of
// duplicating small constants across edge functions.
const PACKS: Record<'small' | 'medium' | 'large', number> = {
  small: 5,
  medium: 15,
  large: 40,
}

Deno.serve(async (req) => {
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

  if (!stripeSecretKey || !webhookSecret) {
    return new Response('Billing is not configured', { status: 503 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  })

  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret)
  } catch (error) {
    console.error('stripe-webhook: signature verification failed', error)
    return new Response('Invalid signature', { status: 400 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  // Stripe retries delivery at-least-once on any non-2xx response or
  // timeout, so the same event.id can arrive more than once. Recording it
  // first (unique constraint) lets a replayed delivery be skipped instead of
  // reapplying the same profile update twice.
  const { error: dedupeError } = await adminClient
    .from('stripe_webhook_events')
    .insert({ id: event.id })

  if (dedupeError) {
    if (dedupeError.code === '23505') {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    console.error(`stripe-webhook: could not record event ${event.id}`, dedupeError)
    return new Response('Could not record event', { status: 500 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        await handlePackCheckoutCompleted(adminClient, event.data.object as Stripe.Checkout.Session)
        break
      }
      case 'charge.refunded': {
        await handleChargeRefunded(adminClient, event.data.object as Stripe.Charge)
        break
      }
      default:
        break
    }
  } catch (error) {
    console.error(`stripe-webhook: failed to handle ${event.type} (${event.id})`, error)
    return new Response('Webhook handler error', { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

/**
 * A one-time pack purchase. Grants credits via grant_check_credits, which is
 * itself idempotent on stripe_payment_intent_id — so even though the
 * stripe_webhook_events dedupe above already blocks a replayed *event*, this
 * is a second, independent layer of protection against ever double-granting
 * the same payment.
 */
async function handlePackCheckoutCompleted(
  adminClient: ReturnType<typeof createClient>,
  session: Stripe.Checkout.Session,
) {
  const userId = session.client_reference_id ?? session.metadata?.user_id
  const packId = session.metadata?.pack_id as 'small' | 'medium' | 'large' | undefined
  const checks = Number(session.metadata?.checks ?? PACKS[packId as 'small' | 'medium' | 'large'])
  const expiresAt = session.metadata?.expires_at
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id

  if (!userId || !packId || !checks || !paymentIntentId) {
    console.error('stripe-webhook: checkout.session.completed missing required metadata', {
      userId,
      packId,
      checks,
      paymentIntentId,
    })
    return
  }

  const { error } = await adminClient.rpc('grant_check_credits', {
    p_user_id: userId,
    p_amount: checks,
    p_source: 'purchase',
    p_stripe_payment_intent_id: paymentIntentId,
    p_stripe_checkout_session_id: session.id,
    p_pack_id: packId,
    p_expires_at: expiresAt ?? null,
  })

  if (error) {
    console.error('stripe-webhook: grant_check_credits failed', error)
    throw error
  }
}

/**
 * Safety net for a refund issued outside the self-service request-refund
 * function (a manual Stripe Dashboard refund, or a dispute) — claws back
 * whatever's still unused on the batch that payment_intent funded.
 */
async function handleChargeRefunded(adminClient: ReturnType<typeof createClient>, charge: Stripe.Charge) {
  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id

  if (!paymentIntentId) {
    console.error('stripe-webhook: charge.refunded missing payment_intent')
    return
  }

  const { data: batch } = await adminClient
    .from('credit_batches')
    .select('id, user_id, checks_remaining')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()

  if (!batch) {
    console.error('stripe-webhook: charge.refunded — no matching pack batch', paymentIntentId)
    return
  }

  if (batch.checks_remaining <= 0) return

  const { data: profile } = await adminClient
    .from('profiles')
    .select('checks_balance')
    .eq('id', batch.user_id)
    .single()

  if (!profile) return

  const clawback = Math.min(batch.checks_remaining, profile.checks_balance)

  await adminClient
    .from('credit_batches')
    .update({ checks_remaining: batch.checks_remaining - clawback })
    .eq('id', batch.id)
  await adminClient
    .from('profiles')
    .update({ checks_balance: profile.checks_balance - clawback })
    .eq('id', batch.user_id)
  await adminClient.from('check_ledger').insert({
    user_id: batch.user_id,
    batch_id: batch.id,
    entry_type: 'refunded',
    amount: -clawback,
    related_stripe_payment_intent_id: paymentIntentId,
    note: 'charge.refunded webhook clawback',
  })
}
