import 'server-only'

// Environment access for the admin app.
//
// Everything here except the two NEXT_PUBLIC_ values is a privileged secret.
// The `server-only` import above makes importing this module from a client
// component a build error rather than a runtime leak, which is the property
// that actually keeps the service role key out of the browser bundle.
//
// Values are read lazily rather than at module load, so a missing variable
// surfaces as a clear error on the request that needs it instead of failing
// the whole build.

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    // The name is safe to include in an error; the value never is.
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function optional(name: string): string | null {
  return process.env[name] ?? null
}

export const env = {
  /** Public: the Supabase project URL, also used by the browser client. */
  get supabaseUrl(): string {
    return required('NEXT_PUBLIC_SUPABASE_URL')
  },
  /** Public: the publishable anon key. Safe in the browser by design. */
  get supabaseAnonKey(): string {
    return required('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  },
  /**
   * PRIVILEGED. Bypasses every RLS policy in the database. Deliberately not
   * prefixed NEXT_PUBLIC_, so Next will not inline it into client output.
   */
  get supabaseServiceRoleKey(): string {
    return required('SUPABASE_SERVICE_ROLE_KEY')
  },
  /**
   * PRIVILEGED but optional. Absent means the Payments and Refunds screens
   * show database state with an explicit "not reconciled against Stripe"
   * notice, rather than silently implying the two agree.
   */
  get stripeSecretKey(): string | null {
    return optional('STRIPE_SECRET_KEY')
  },
  get isStripeConfigured(): boolean {
    return Boolean(optional('STRIPE_SECRET_KEY'))
  },
  /**
   * PRIVILEGED but optional. Read-only use here. Absent means the Email screen
   * says plainly that Brevo is not connected rather than rendering zeros, which
   * would read as "no email was delivered".
   *
   * It currently exists only as a Supabase Edge Function secret, so it has to
   * be added to this project separately.
   */
  get brevoApiKey(): string | null {
    return optional('BREVO_API_KEY')
  },
  /** The newsletter list id, for reconciling Brevo's count against ours. */
  get brevoNewsletterListId(): string | null {
    return optional('BREVO_NEWSLETTER_LIST_ID')
  },
  /** Where the "Back to MyRecruiterCheck" link points. */
  get publicSiteUrl(): string {
    return optional('NEXT_PUBLIC_SITE_URL') ?? 'https://myrecruitercheck.com'
  },
}

/**
 * Reports which required variables are missing, for the health panel.
 * Returns names only; a value is never read into the result.
 */
export function missingRequiredEnv(): string[] {
  const names = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]
  return names.filter((name) => !process.env[name])
}
