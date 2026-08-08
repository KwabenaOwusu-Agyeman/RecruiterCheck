-- RecruiterCheck initial schema

create type public.subscription_tier as enum ('free', 'premium_weekly', 'premium_monthly');
create type public.subscription_status as enum ('active', 'cancelled', 'past_due', 'trialing');
create type public.check_status as enum ('draft', 'processing', 'completed', 'failed');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  subscription_tier public.subscription_tier not null default 'free',
  subscription_status public.subscription_status not null default 'active',
  stripe_customer_id text unique,
  checks_used_this_period integer not null default 0 check (checks_used_this_period >= 0),
  period_reset_at timestamptz not null default (date_trunc('month', now()) + interval '1 month'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  job_title text,
  company_name text,
  job_description text not null default '',
  cv_storage_path text not null,
  cv_file_name text not null,
  status public.check_status not null default 'draft',
  interview_probability_score integer check (
    interview_probability_score is null
    or (interview_probability_score >= 0 and interview_probability_score <= 100)
  ),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null unique references public.checks (id) on delete cascade,
  summary text not null,
  strengths jsonb not null default '[]'::jsonb,
  improvements jsonb not null default '[]'::jsonb,
  recruiter_perspective text not null,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan public.subscription_tier not null,
  status public.subscription_status not null default 'active',
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_plan_premium check (plan in ('premium_weekly', 'premium_monthly'))
);

create index checks_user_id_created_at_idx on public.checks (user_id, created_at desc);
create index subscriptions_user_id_idx on public.subscriptions (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger checks_set_updated_at
before update on public.checks
for each row execute function public.set_updated_at();

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.get_check_limit(p_tier public.subscription_tier)
returns integer
language sql
immutable
as $$
  select case p_tier
    when 'free' then 3
    when 'premium_weekly' then 10
    when 'premium_monthly' then 50
  end;
$$;

alter table public.profiles enable row level security;
alter table public.checks enable row level security;
alter table public.feedback enable row level security;
alter table public.subscriptions enable row level security;

create policy "Users can view own profile"
on public.profiles for select
using (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Users can view own checks"
on public.checks for select
using (auth.uid() = user_id);

create policy "Users can insert own checks"
on public.checks for insert
with check (auth.uid() = user_id);

create policy "Users can update own checks"
on public.checks for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can view feedback for own checks"
on public.feedback for select
using (
  exists (
    select 1 from public.checks
    where checks.id = feedback.check_id
      and checks.user_id = auth.uid()
  )
);

create policy "Users can view own subscriptions"
on public.subscriptions for select
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cvs',
  'cvs',
  false,
  10485760,
  array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
)
on conflict (id) do nothing;

create policy "Users can upload own CVs"
on storage.objects for insert
with check (
  bucket_id = 'cvs'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can read own CVs"
on storage.objects for select
using (
  bucket_id = 'cvs'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can update own CVs"
on storage.objects for update
using (
  bucket_id = 'cvs'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'cvs'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can delete own CVs"
on storage.objects for delete
using (
  bucket_id = 'cvs'
  and auth.uid()::text = (storage.foldername(name))[1]
);
