-- Profile basics, opt in.
--
-- Build item 2 of the Decision Log entry "Data strategy: what we collect, for
-- product value and exit readiness" (approved 2026-09-16). The user fills
-- these in on the Account page, behind their own consent, and can clear them
-- at any time. Nothing here is required to use the product, and nothing here
-- feeds scoring.
--
-- Why a separate table rather than columns on profiles: profiles is written by
-- signup, Stripe and the credit system, its rows exist whether or not the user
-- consented, and consent has to be recorded with the wording it was given
-- under. A row here exists only because someone opted in, so the row IS the
-- consent record and deleting it is a complete withdrawal.
--
-- CLASSIFICATION: SENSITIVE. These are personal details about an identified
-- user. The Control Centre reads them with the service role and shows counts
-- only, never a row.
--
-- Deliberately NOT collected, per the same decision: age, gender, and any
-- special category data (health, disability, ethnicity, religion, sexuality).
--
-- The vocabularies below are closed sets rather than free text, so the data
-- stays countable and a typo cannot become a category. target_role is the one
-- free text field, because job titles cannot be enumerated.

create table if not exists public.user_profile_basics (
  user_id uuid primary key references public.profiles (id) on delete cascade,

  consent_at timestamptz not null default now(),
  consent_version text not null check (length(consent_version) between 1 and 40),

  target_role text check (length(btrim(target_role)) between 1 and 120),
  seniority text check (seniority in ('student', 'entry', 'mid', 'senior', 'lead', 'head_or_director')),
  country text check (country ~ '^[A-Z]{2}$'),
  years_experience integer check (years_experience between 0 and 60),
  industry text check (industry in (
    'technology', 'finance', 'healthcare', 'education', 'government', 'retail',
    'manufacturing', 'energy', 'media', 'nonprofit', 'consulting', 'other'
  )),
  employment_status text check (employment_status in (
    'employed', 'self_employed', 'seeking', 'student', 'other'
  )),
  education_level text check (education_level in (
    'secondary', 'vocational', 'bachelor', 'master', 'doctorate', 'other'
  )),
  needs_work_permit boolean,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profile_basics enable row level security;

drop policy if exists "Users can view own profile basics" on public.user_profile_basics;
create policy "Users can view own profile basics"
on public.user_profile_basics for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own profile basics" on public.user_profile_basics;
create policy "Users can insert own profile basics"
on public.user_profile_basics for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own profile basics" on public.user_profile_basics;
create policy "Users can update own profile basics"
on public.user_profile_basics for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Withdrawal is a delete, and it is the user's own to make.
drop policy if exists "Users can delete own profile basics" on public.user_profile_basics;
create policy "Users can delete own profile basics"
on public.user_profile_basics for delete
using (auth.uid() = user_id);

-- Column level grants: consent_at, created_at and updated_at are set by the
-- database and by the trigger below, never by the client, so a row cannot
-- claim an earlier consent date than it has.
revoke all on public.user_profile_basics from anon, authenticated;
grant select on public.user_profile_basics to authenticated;
grant delete on public.user_profile_basics to authenticated;
grant insert (
  user_id, consent_version, target_role, seniority, country, years_experience,
  industry, employment_status, education_level, needs_work_permit
) on public.user_profile_basics to authenticated;
grant update (
  consent_version, target_role, seniority, country, years_experience,
  industry, employment_status, education_level, needs_work_permit
) on public.user_profile_basics to authenticated;
grant select, insert, update, delete on public.user_profile_basics to service_role;

-- set_updated_at already exists (20260807120000) and is used by profiles and
-- checks. Reused rather than redefined.
drop trigger if exists set_user_profile_basics_updated_at on public.user_profile_basics;
create trigger set_user_profile_basics_updated_at
before update on public.user_profile_basics
for each row execute function public.set_updated_at();

comment on table public.user_profile_basics is
  'Opt in profile details (role, seniority, country, experience, industry, employment, education, work permit). SENSITIVE. One row per user, created only by the user''s own consent; deleting the row withdraws it. Shown in the Control Centre as counts only.';
comment on column public.user_profile_basics.consent_version is
  'The version of the consent wording shown when the row was created or last saved (src/lib/profileBasics.ts).';
