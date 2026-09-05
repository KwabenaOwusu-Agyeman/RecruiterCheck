-- Acquisition attribution: record where a visitor came from.
--
-- Nothing in the system recorded this. There is no UTM parsing, no referrer,
-- no campaign column, and all 23 SEO landing pages fire an identical bare
-- `landing_view`, so "which page earns its keep" and "which channel produces
-- paying customers" are both currently unanswerable. Marketing reporting built
-- without this would show channel effort beside product outcomes with no way
-- to join the two.
--
-- Entirely additive: nullable columns only, no existing column altered, no RLS
-- policy touched, and nothing a customer sees changes.
--
-- Note on trust. `anon` can INSERT into analytics_events, so every text column
-- below is unauthenticated free text. Each is bounded by a CHECK here as well
-- as in src/lib/attribution.ts, because a client-side cap is a convenience and
-- a database constraint is the actual guarantee.
--
-- Only the referrer HOST is stored, never the full referring URL: a referring
-- URL's query string routinely carries search terms, session ids and
-- occasionally an email address.

-- analytics_events ------------------------------------------------------------
-- page_path is what finally makes `landing_view` per page rather than one
-- undifferentiated count across the whole site.
alter table public.analytics_events
  add column if not exists page_path text
    check (page_path is null or length(page_path) <= 200),
  add column if not exists utm_source text
    check (utm_source is null or length(utm_source) <= 100),
  add column if not exists utm_medium text
    check (utm_medium is null or length(utm_medium) <= 100),
  add column if not exists utm_campaign text
    check (utm_campaign is null or length(utm_campaign) <= 100),
  add column if not exists referrer_host text
    check (referrer_host is null or length(referrer_host) <= 253);

comment on column public.analytics_events.page_path is
  'Path only, never the query string. Makes landing_view attributable to a specific page.';
comment on column public.analytics_events.referrer_host is
  'Hostname of an external referrer only. Same-origin referrers and full URLs are never stored.';

-- profiles --------------------------------------------------------------------
-- First touch, copied from the visitor's stored attribution at signup.
alter table public.profiles
  add column if not exists acquisition_source text
    check (acquisition_source is null or length(acquisition_source) <= 100),
  add column if not exists acquisition_medium text
    check (acquisition_medium is null or length(acquisition_medium) <= 100),
  add column if not exists acquisition_campaign text
    check (acquisition_campaign is null or length(acquisition_campaign) <= 100),
  add column if not exists acquisition_landing_path text
    check (acquisition_landing_path is null or length(acquisition_landing_path) <= 200),
  add column if not exists acquisition_referrer_host text
    check (acquisition_referrer_host is null or length(acquisition_referrer_host) <= 253),
  add column if not exists acquisition_captured_at timestamptz;

comment on column public.profiles.acquisition_source is
  'First-touch acquisition, written once by the client just after signup. Immutable afterwards; see protect_profile_acquisition_fields.';

-- Write-once protection --------------------------------------------------------
-- These columns are written by the browser through the existing "Users can
-- update own profile" policy, which is the safest available write path: it
-- keeps handle_new_user untouched, and handle_new_user runs on every signup, so
-- breaking it would break registration outright.
--
-- The cost of that choice is that the values are client-supplied and the same
-- client could later change them. This makes them write once: settable while
-- null, frozen afterwards. Attribution that can be rewritten at will is not
-- evidence of anything.
--
-- Implemented as its OWN trigger rather than as an edit to
-- protect_profile_billing_fields, so it can be dropped independently without
-- touching the billing protection that guards balances.
--
-- It reverts silently rather than raising, matching the established pattern in
-- 20260811090000. An unrelated profile update that happens to carry these
-- columns should quietly have no effect on them, not fail.
create or replace function public.protect_profile_acquisition_fields()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if auth.role() is distinct from 'service_role' then
    if old.acquisition_source is not null then
      new.acquisition_source := old.acquisition_source;
    end if;
    if old.acquisition_medium is not null then
      new.acquisition_medium := old.acquisition_medium;
    end if;
    if old.acquisition_campaign is not null then
      new.acquisition_campaign := old.acquisition_campaign;
    end if;
    if old.acquisition_landing_path is not null then
      new.acquisition_landing_path := old.acquisition_landing_path;
    end if;
    if old.acquisition_referrer_host is not null then
      new.acquisition_referrer_host := old.acquisition_referrer_host;
    end if;
    -- The timestamp anchors the whole record, so it is frozen with it.
    if old.acquisition_captured_at is not null then
      new.acquisition_captured_at := old.acquisition_captured_at;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists profiles_protect_acquisition_fields on public.profiles;
create trigger profiles_protect_acquisition_fields
  before update on public.profiles
  for each row execute function public.protect_profile_acquisition_fields();

-- Verify the outcome rather than assuming it, in the style of the surrounding
-- migrations.
do $$
declare
  v_missing text;
begin
  select string_agg(needed, ', ')
    into v_missing
  from unnest(array[
    'acquisition_source', 'acquisition_medium', 'acquisition_campaign',
    'acquisition_landing_path', 'acquisition_referrer_host', 'acquisition_captured_at'
  ]) as needed
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = needed
  );
  if v_missing is not null then
    raise exception 'profiles is missing acquisition columns: %', v_missing;
  end if;

  select string_agg(needed, ', ')
    into v_missing
  from unnest(array[
    'page_path', 'utm_source', 'utm_medium', 'utm_campaign', 'referrer_host'
  ]) as needed
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'analytics_events' and column_name = needed
  );
  if v_missing is not null then
    raise exception 'analytics_events is missing attribution columns: %', v_missing;
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'profiles_protect_acquisition_fields' and not tgisinternal
  ) then
    raise exception 'the acquisition write-once trigger was not created';
  end if;
end $$;
