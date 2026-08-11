import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://recruitercheck.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // Cancel any active Stripe subscription before wiping the local record
    // of it, so the user isn't billed after deleting their account. This
    // must block deletion on a genuine failure — silently deleting the
    // account while a subscription is still active would leave it billing
    // an account the user can no longer access or manage. A 404
    // (resource_missing — already cancelled, or never existed) is not a
    // failure and does not block deletion.
    if (stripeSecretKey) {
      const { data: subscription } = await adminClient
        .from('subscriptions')
        .select('stripe_subscription_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (subscription?.stripe_subscription_id) {
        let stripeResponse: Response
        try {
          stripeResponse = await fetch(
            `https://api.stripe.com/v1/subscriptions/${subscription.stripe_subscription_id}`,
            {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${stripeSecretKey}` },
            },
          )
        } catch (stripeError) {
          console.error('delete-account: Stripe cancellation request failed', {
            userId: user.id,
            message: stripeError instanceof Error ? stripeError.message : String(stripeError),
          })
          return jsonResponse(
            { error: 'Could not cancel your subscription. Please try again or contact support.' },
            502,
          )
        }

        if (!stripeResponse.ok) {
          const errorBody = await stripeResponse.json().catch(() => null)
          const isAlreadyGone =
            stripeResponse.status === 404 || errorBody?.error?.code === 'resource_missing'

          if (!isAlreadyGone) {
            console.error('delete-account: Stripe cancellation failed', {
              userId: user.id,
              status: stripeResponse.status,
            })
            return jsonResponse(
              { error: 'Could not cancel your subscription. Please try again or contact support.' },
              502,
            )
          }
        }
      }
    }

    // Nothing retained per the GDPR delete cascade: every CV, generated
    // document, feedback row (via FK cascade), then the checks themselves.
    const { data: checks } = await adminClient
      .from('checks')
      .select('id, cv_storage_path')
      .eq('user_id', user.id)

    for (const check of checks ?? []) {
      if (check.cv_storage_path) {
        await adminClient.storage.from('cvs').remove([check.cv_storage_path])
      }

      const documentsPrefix = `${user.id}/${check.id}`
      const { data: documentFiles } = await adminClient.storage
        .from('documents')
        .list(documentsPrefix)

      if (documentFiles && documentFiles.length > 0) {
        await adminClient.storage
          .from('documents')
          .remove(documentFiles.map((file) => `${documentsPrefix}/${file.name}`))
      }
    }

    await adminClient.from('checks').delete().eq('user_id', user.id)
    await adminClient.from('subscriptions').delete().eq('user_id', user.id)
    await adminClient.from('profiles').delete().eq('id', user.id)

    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(user.id)
    if (deleteUserError) {
      console.error('Could not delete auth user:', deleteUserError)
      return jsonResponse({ error: 'Could not delete account' }, 500)
    }

    return jsonResponse({ success: true })
  } catch (error) {
    console.error('delete-account error:', error)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
