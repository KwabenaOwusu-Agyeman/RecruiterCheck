import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import Stripe from 'npm:stripe@17.5.0'

type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'trialing'
type SubscriptionTier = 'free' | 'premium_weekly' | 'premium_monthly'

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
      default:
        break
    }
  } catch (error) {
    console.error(`stripe-webhook: failed to handle ${event.type}`, error)
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
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id
  const currentPeriodEnd = extractCurrentPeriodEnd(subscription)

  await adminClient
    .from('subscriptions')
    .update({ status, current_period_end: currentPeriodEnd })
    .eq('stripe_subscription_id', subscription.id)

  const profileUpdate: { subscription_status: SubscriptionStatus; subscription_tier?: SubscriptionTier } =
    { subscription_status: status }

  if (status === 'cancelled') {
    profileUpdate.subscription_tier = 'free'
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
