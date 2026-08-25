-- The previous migration's view used security_invoker = false, which the
-- Supabase linter correctly flags as a "Security Definer View" (ERROR): it
-- bypasses product_feedback's RLS via the view owner's privileges, an
-- implicit bypass that could leak private rows if the view is ever edited
-- without realizing it. Fixed properly here: an explicit RLS policy scoped
-- to consented rows, plus a security_invoker view that respects the
-- querying user's own permissions rather than the owner's.
drop view if exists public.public_testimonials;

create policy "Public can view consented feedback"
  on public.product_feedback
  for select
  to anon, authenticated
  using (feature_consent = true);

create view public.public_testimonials
with (security_invoker = true)
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
  'Public-safe subset of product_feedback: only rows with feature_consent = true (enforced by the "Public can view consented feedback" RLS policy, not by view-owner bypass), and only columns safe to show publicly. Never add email, user_id, or check_id to this view.';

grant select on public.public_testimonials to anon, authenticated;
