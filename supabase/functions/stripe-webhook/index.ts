import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import Stripe from 'npm:stripe@17.5.0'

type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'trialing'
type SubscriptionTier = 'free' | 'starter' | 'active' | 'power'

// Kept in sync with PRICING_PLANS in src/lib/constants.ts and PLAN_PRICES in
// create-checkout-session, per this codebase's existing convention of
// duplicating small constants across edge functions.
const PLAN_CHECK_LIMITS: Record<'starter' | 'active' | 'power', number> = {
  starter: 5,
  active: 10,
  power: 20,
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
  // reapplying the same profile/subscription update twice.
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
        await handleCheckoutCompleted(
          adminClient,
          stripe,
          event.data.object as Stripe.Checkout.Session,
        )
        break
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await handleSubscriptionChange(
          adminClient,
          event.data.object as Stripe.Subscription,
          event.type === 'customer.subscription.deleted',
        )
        break
      }
      case 'invoice.payment_failed': {
        await handleInvoicePaymentFailed(adminClient, event.data.object as Stripe.Invoice)
        break
      }
      case 'invoice.payment_succeeded': {
        await handleInvoicePaymentSucceeded(adminClient, stripe, event.data.object as Stripe.Invoice)
        break
      }
      case 'charge.refunded': {
        await handleChargeRefunded(adminClient, stripe, event.data.object as Stripe.Charge)
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

async function handleCheckoutCompleted(
  adminClient: ReturnType<typeof createClient>,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
) {
  const userId = session.client_reference_id ?? session.metadata?.user_id
  const plan = session.metadata?.plan as SubscriptionTier | undefined
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id

  if (!userId || !plan) {
    console.error('stripe-webhook: checkout.session.completed missing user_id/plan metadata')
    return
  }

  await adminClient
    .from('profiles')
    .update({
      subscription_tier: plan,
      subscription_status: 'active',
      stripe_customer_id: customerId ?? null,
      // First charge of a new subscription (or a resubscribe) starts the
      // allotment fresh — invoice.payment_succeeded does the same on every
      // later weekly renewal.
      period_checks_consumed: 0,
      period_checks_limit: PLAN_CHECK_LIMITS[plan as 'starter' | 'active' | 'power'] ?? 0,
    })
    .eq('id', userId)

  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id

  if (subscriptionId) {
    // Fetch the subscription directly rather than requiring a second webhook
    // event (customer.subscription.created) just to learn the period end.
    let currentPeriodEnd: string | null = null
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      currentPeriodEnd = extractCurrentPeriodEnd(subscription)
    } catch (error) {
      console.error('stripe-webhook: could not fetch subscription for period end', error)
    }

    await adminClient.from('subscriptions').upsert(
      {
        user_id: userId,
        plan,
        status: 'active',
        stripe_subscription_id: subscriptionId,
        current_period_end: currentPeriodEnd,
      },
      { onConflict: 'stripe_subscription_id' },
    )
  }
}

async function handleSubscriptionChange(
  adminClient: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription,
  deleted: boolean,
) {
  const status = deleted ? 'cancelled' : mapStripeStatus(subscription.status)
  const userId = subscription.metadata?.user_id
  const metadataPlan = subscription.metadata?.plan as 'starter' | 'active' | 'power' | undefined
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id
  const currentPeriodEnd = extractCurrentPeriodEnd(subscription)

  const subscriptionUpdate: { status: SubscriptionStatus; current_period_end: string | null; plan?: SubscriptionTier } =
    { status, current_period_end: currentPeriodEnd }
  if (!deleted && metadataPlan) {
    subscriptionUpdate.plan = metadataPlan
  }

  await adminClient
    .from('subscriptions')
    .update(subscriptionUpdate)
    .eq('stripe_subscription_id', subscription.id)

  const profileUpdate: {
    subscription_status: SubscriptionStatus
    subscription_tier?: SubscriptionTier
    period_checks_consumed?: number
    period_checks_limit?: number
  } = { subscription_status: status }

  if (status === 'cancelled') {
    profileUpdate.subscription_tier = 'free'
    profileUpdate.period_checks_consumed = 0
    profileUpdate.period_checks_limit = 0
  } else if (metadataPlan) {
    // A plan switch (see changeExistingSubscription in create-checkout-session)
    // updates this subscription's own metadata.plan directly via the Stripe
    // API and already writes profiles synchronously — this re-applies the
    // same values when the webhook event lands, which is a harmless no-op
    // for that path, and is the ONLY thing that keeps profiles.subscription_tier
    // correct for a plan change made from the Stripe billing portal instead
    // (which this webhook is the sole notification of).
    profileUpdate.subscription_tier = metadataPlan
    profileUpdate.period_checks_limit = PLAN_CHECK_LIMITS[metadataPlan]
  }

  if (userId) {
    await adminClient.from('profiles').update(profileUpdate).eq('id', userId)
  } else if (customerId) {
    await adminClient.from('profiles').update(profileUpdate).eq('stripe_customer_id', customerId)
  } else {
    console.error('stripe-webhook: subscription event missing user_id and customer id')
  }
}

/**
 * Fires immediately on a failed charge, ahead of (and more reliably than)
 * waiting for customer.subscription.updated to eventually reflect a status
 * transition — Smart Retries can keep the subscription 'active' for days
 * during the retry schedule before it ever moves to past_due/unpaid.
 */
async function handleInvoicePaymentFailed(
  adminClient: ReturnType<typeof createClient>,
  invoice: Stripe.Invoice,
) {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
  if (!customerId) {
    console.error('stripe-webhook: invoice.payment_failed missing customer id')
    return
  }

  await adminClient
    .from('profiles')
    .update({ subscription_status: 'past_due' })
    .eq('stripe_customer_id', customerId)
}

/**
 * Confirms/restores active status the moment a payment succeeds (covers
 * both a normal renewal and recovery after a past_due retry), refreshes
 * current_period_end so the Account page's "Next billing date" stays
 * accurate, and resets the weekly check allotment for the new period. Fires
 * on the first invoice of a brand new subscription too (alongside
 * checkout.session.completed, which already zeroed the counter) — resetting
 * again here is harmless, no rollover ever accumulates either way. Only the
 * consumed counter is reset, not the limit: a plan's limit is set once by
 * checkout.session.completed and this event carries no plan info to
 * recompute it from.
 */
async function handleInvoicePaymentSucceeded(
  adminClient: ReturnType<typeof createClient>,
  stripe: Stripe,
  invoice: Stripe.Invoice,
) {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
  if (!customerId) {
    console.error('stripe-webhook: invoice.payment_succeeded missing customer id')
    return
  }

  await adminClient
    .from('profiles')
    .update({ subscription_status: 'active', period_checks_consumed: 0 })
    .eq('stripe_customer_id', customerId)

  const subscriptionId =
    typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id

  if (!subscriptionId) return

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    await adminClient
      .from('subscriptions')
      .update({ status: 'active', current_period_end: extractCurrentPeriodEnd(subscription) })
      .eq('stripe_subscription_id', subscriptionId)
  } catch (error) {
    console.error('stripe-webhook: could not refresh subscription after payment success', error)
  }
}

/**
 * Safety net for a refund issued outside the self-service request-refund
 * function (a manual Stripe Dashboard refund, or a dispute) — ensures the
 * customer's paid access is removed no matter which path issued the refund,
 * rather than relying on every refund path remembering to also cancel the
 * subscription and downgrade the profile. When request-refund itself issued
 * the refund, this fires afterward and just re-applies the same already-
 * applied values, a harmless no-op (a subscription already cancelled simply
 * fails to cancel again, which is caught and logged, not fatal).
 */
async function handleChargeRefunded(
  adminClient: ReturnType<typeof createClient>,
  stripe: Stripe,
  charge: Stripe.Charge,
) {
  const customerId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id
  if (!customerId) {
    console.error('stripe-webhook: charge.refunded missing customer id')
    return
  }

  const { data: profile } = await adminClient
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()

  if (!profile) {
    console.error('stripe-webhook: charge.refunded — no profile for customer', customerId)
    return
  }

  const { data: activeSubscription } = await adminClient
    .from('subscriptions')
    .select('stripe_subscription_id')
    .eq('user_id', profile.id)
    .eq('status', 'active')
    .not('stripe_subscription_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (activeSubscription?.stripe_subscription_id) {
    try {
      await stripe.subscriptions.cancel(activeSubscription.stripe_subscription_id)
    } catch (error) {
      console.error('stripe-webhook: could not cancel subscription after refund', error)
    }
    await adminClient
      .from('subscriptions')
      .update({ status: 'cancelled' })
      .eq('stripe_subscription_id', activeSubscription.stripe_subscription_id)
  }

  await adminClient
    .from('profiles')
    .update({
      subscription_tier: 'free',
      subscription_status: 'cancelled',
      period_checks_consumed: 0,
      period_checks_limit: 0,
    })
    .eq('id', profile.id)
}

/**
 * Newer Stripe API versions moved current_period_end off the top-level
 * Subscription object and onto each subscription item. Since the webhook
 * endpoint's api_version isn't guaranteed to match the SDK's pinned version,
 * check both shapes rather than assuming one.
 */
function extractCurrentPeriodEnd(subscription: Stripe.Subscription): string | null {
  const topLevel = (subscription as unknown as { current_period_end?: number })
    .current_period_end
  const itemLevel = subscription.items?.data?.[0]?.current_period_end

  const epochSeconds = topLevel ?? itemLevel
  return epochSeconds ? new Date(epochSeconds * 1000).toISOString() : null
}

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case 'active':
      return 'active'
    case 'trialing':
      return 'trialing'
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
      return 'past_due'
    default:
      return 'cancelled'
  }
}
