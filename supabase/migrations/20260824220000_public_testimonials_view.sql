-- Exposes only the subset of product_feedback rows and columns a user has
-- explicitly consented to share publicly (feature_consent = true), so the
-- landing page can show real testimonials without granting any public read
-- access to product_feedback itself (email, user_id, check_id, and any
-- non-consented row stay fully private via the table's existing RLS).
create view public.public_testimonials
with (security_invoker = false)
as
select
  rating,
  comment,
  display_name,
  target_role,
  created_at
from public.product_feedback
where feature_consent = true
  and comment is not null
  and display_name is not null;

comment on view public.public_testimonials is
  'Public-safe subset of product_feedback: only rows with feature_consent = true, and only columns safe to show publicly. Intentionally bypasses product_feedback''s RLS via view-owner privileges (security_invoker = false), since the WHERE clause and column list already enforce the same consent boundary. Never add email, user_id, or check_id to this view.';

grant select on public.public_testimonials to anon, authenticated;
