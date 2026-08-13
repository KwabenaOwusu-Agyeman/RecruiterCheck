import { supabase } from '@/lib/supabase'

export async function subscribeToNewsletter(email: string, consent: boolean, source: string) {
  const { data, error } = await supabase.functions.invoke('newsletter-subscribe', {
    body: { email, consent, source, website: '' },
  })

  if (error) throw new Error('We could not save your subscription. Try again.')
  if (data?.error) throw new Error(data.error)
}

export async function unsubscribeFromNewsletter(token: string) {
  const { data, error } = await supabase.functions.invoke('newsletter-unsubscribe', {
    body: { token },
  })

  if (error) throw new Error('We could not update your subscription. Try again.')
  if (data?.error) throw new Error(data.error)
}

