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

/**
 * A card shows exactly four things: the submitted rating as real stars, the
 * comment, the name, and the role checked. Some submissions also paste a star
 * row into the comment body, which then renders as a second set of stars
 * inside the quote. Star glyphs in comment text are always ignored, wherever
 * they appear, so the rating column stays the only source of stars.
 *
 * Stored rows were cleaned once at the source; this keeps the guarantee for
 * anything submitted later.
 */
// The variation selector (U+FE0F) is matched outside the class, as an
// optional suffix, rather than inside it: a class mixing it with the
// glyphs it modifies is a misleading character class (eslint
// no-misleading-character-class). Trailing alternative catches a stray
// selector left behind on its own.
const STAR_GLYPHS = /(?:[\u2b50\u2605\u2606\u2726-\u2730]|\u{1f31f})\ufe0f?|\ufe0f/gu

function stripStarGlyphs(comment: string): string {
  return comment
    .replace(STAR_GLYPHS, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()
}

export async function getPublicTestimonials(): Promise<Testimonial[]> {
  const { data, error } = await supabase
    .from('public_testimonials')
    .select('rating, comment, display_name, target_role')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? [])
    .map((row) => ({
      rating: row.rating as number,
      comment: stripStarGlyphs(row.comment as string),
      displayName: row.display_name as string,
      targetRole: row.target_role as string | null,
    }))
    .filter((testimonial) => testimonial.comment.length > 0)
}
