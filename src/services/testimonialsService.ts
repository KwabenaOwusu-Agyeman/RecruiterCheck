import { supabase } from '@/lib/supabase'

/**
 * Backed by the public.public_testimonials view (see
 * supabase/migrations/20260824220100_fix_public_testimonials_security_definer.sql):
 * only product_feedback rows the user explicitly marked feature_consent =
 * true, and only the columns safe to show publicly. Never add email,
 * userId, or checkId here.
 */
export interface Testimonial {
  rating: number
  comment: string
  displayName: string
  targetRole: string | null
}

export async function getPublicTestimonials(): Promise<Testimonial[]> {
  const { data, error } = await supabase
    .from('public_testimonials')
    .select('rating, comment, display_name, target_role')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row) => ({
    rating: row.rating as number,
    comment: row.comment as string,
    displayName: row.display_name as string,
    targetRole: row.target_role as string | null,
  }))
}
