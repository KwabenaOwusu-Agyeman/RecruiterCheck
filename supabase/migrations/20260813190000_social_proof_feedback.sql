alter table public.product_feedback
  add column if not exists check_id uuid references public.checks (id) on delete set null,
  add column if not exists display_name text,
  add column if not exists target_role text,
  add column if not exists feature_consent boolean not null default false,
  add column if not exists feature_consent_at timestamptz;

create unique index if not exists product_feedback_one_per_user_idx
  on public.product_feedback (user_id);

alter table public.product_feedback
  drop constraint if exists product_feedback_feature_consent_complete;
alter table public.product_feedback
  add constraint product_feedback_feature_consent_complete check (
    not feature_consent
    or (display_name is not null and comment is not null and feature_consent_at is not null)
  );

alter table public.product_feedback enable row level security;

drop policy if exists "Users can view own product feedback" on public.product_feedback;
create policy "Users can view own product feedback"
on public.product_feedback for select
using (auth.uid() = user_id);

drop policy if exists "Users can submit own product feedback" on public.product_feedback;
create policy "Users can submit own product feedback"
on public.product_feedback for insert
with check (
  auth.uid() = user_id
  and (check_id is null or exists (
    select 1
    from public.checks
    where checks.id = product_feedback.check_id
      and checks.user_id = auth.uid()
      and checks.status = 'completed'
  ))
);

comment on table public.product_feedback is
  'One voluntary response per authenticated user. First name, target role and comment remain private unless feature_consent is true.';
