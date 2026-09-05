-- Records three tables and one column that exist in production but were never
-- captured in a migration file: analytics_events, analyze_requests,
-- product_feedback, and checks.output_language. They were applied out of band,
-- so a from-scratch replay of this directory fails at
-- 20260811160000_analytics_events_anon_insert.sql, which alters a table that
-- was never created. That has made `supabase db reset` and preview branches
-- unusable, which in turn means no migration can be tested before it reaches
-- production -- the exact failure mode CLAUDE.md warns about.
--
-- Timestamped immediately after 20260807120000_initial_schema so it lands
-- before every migration that alters these objects (earliest is
-- 20260811150000). Appending it at the end of the directory would not work.
--
-- SAFETY: every block is guarded on the object being absent, so against
-- production this migration does nothing whatsoever. It deliberately does not
-- use `drop policy if exists ... create policy`, the usual idempotency idiom,
-- because that would drop and recreate live RLS policies on a database holding
-- candidate and payment data, replacing the real definitions with these
-- reconstructions. Creating nothing is the only safe behaviour here.
--
-- Column definitions are taken from the live production schema. The RLS
-- policies below are reconstructions: the original out-of-band definitions
-- could not be read without querying production, so they are written to be at
-- least as restrictive as production's behaviour implies. They apply only to a
-- freshly built database, never to production.

-- analytics_events -----------------------------------------------------------
-- user_id defaults to auth.uid(), so a signed-in user's events are attributed
-- to them automatically and an anonymous insert lands as null. Created NOT NULL
-- here because 20260811160000 later drops that constraint.
do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'analytics_events'
  ) then
    create table public.analytics_events (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null default auth.uid() references public.profiles (id),
      event_type text not null,
      domain_category text,
      created_at timestamptz not null default now()
    );

    alter table public.analytics_events enable row level security;

    grant insert on table public.analytics_events to authenticated;

    create policy "Users can insert own analytics events"
      on public.analytics_events
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;
end
$$;

-- analyze_requests -----------------------------------------------------------
-- Service-role-only, RLS on with no policies. Referenced by no application code
-- and empty in production; recorded here so a replay matches production rather
-- than because anything depends on it.
do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'analyze_requests'
  ) then
    create table public.analyze_requests (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles (id),
      created_at timestamptz not null default now()
    );

    alter table public.analyze_requests enable row level security;
  end if;
end
$$;

-- product_feedback -----------------------------------------------------------
-- Base shape only. 20260813190000_social_proof_feedback.sql adds check_id,
-- display_name, target_role, feature_consent, feature_consent_at, the
-- one-per-user unique index, the consent constraint, RLS and every policy, so
-- none of that is repeated here.
-- user_id references auth.users directly, not profiles, matching production.
do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'product_feedback'
  ) then
    create table public.product_feedback (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users (id) on delete cascade,
      email text not null,
      rating smallint not null check (rating >= 1 and rating <= 5),
      comment text,
      created_at timestamptz not null default now()
    );

    alter table public.product_feedback enable row level security;
  end if;
end
$$;

-- checks.output_language -----------------------------------------------------
-- Read by analyze-check and generate-documents. `add column if not exists` is
-- already a no-op when present, so no guard block is needed.
alter table public.checks
  add column if not exists output_language text not null default 'auto'
    check (output_language in ('auto', 'en', 'nl'));
