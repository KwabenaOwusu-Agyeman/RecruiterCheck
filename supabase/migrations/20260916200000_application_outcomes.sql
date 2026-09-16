-- Application outcome follow up.
--
-- Implements the Decision Log entry "Data strategy: what we collect, for
-- product value and exit readiness" (approved 16 September 2026), build item 1.
--
-- A user opts in at the end of a completed check. Twenty one days later the
-- send-outcome-followups function emails a link carrying followup_token. The
-- public /outcome page posts the answers to submit-application-outcome, which
-- finds the row by token with the service role. No login is involved in
-- answering, which is why the token is the only way in and why users have no
-- UPDATE policy of their own.
--
-- CLASSIFICATION: SENSITIVE. Rows describe a person's job application and may
-- hold a salary offer. Read by the Control Centre with the service role, and
-- only ever shown there in aggregate. followup_token is a credential and is on
-- the Control Centre's redact() deny list.
--
-- Consent: consent_at and consent_version record when and under which wording
-- the user opted in. withdrawn_at is set by "stop asking me"; a withdrawn row
-- is never emailed and its answers are never written.

create table if not exists public.application_outcomes (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null unique references public.checks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,

  consent_at timestamptz not null default now(),
  consent_version text not null check (length(consent_version) between 1 and 40),
  withdrawn_at timestamptz,

  followup_token uuid not null unique default gen_random_uuid(),
  followup_due_at timestamptz not null default (now() + interval '21 days'),
  followup_sent_at timestamptz,
  followup_send_attempts integer not null default 0,

  responded_at timestamptz,
  applied boolean,
  channel text check (channel in ('job_board', 'referral', 'company_site', 'other')),
  stage text check (stage in ('no_reply', 'rejected', 'interview', 'offer')),
  days_to_reply integer check (days_to_reply between 0 and 365),
  salary_offered numeric(12, 2) check (salary_offered > 0 and salary_offered < 10000000),
  salary_currency text check (salary_currency ~ '^[A-Z]{3}$'),
  salary_country text check (salary_country ~ '^[A-Z]{2}$'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- An answered row always says whether the user applied.
  constraint application_outcomes_response_complete
    check (responded_at is null or applied is not null),
  -- Channel and stage only mean something for an application that was made.
  constraint application_outcomes_applied_fields
    check (applied is true or (channel is null and stage is null and days_to_reply is null)),
  -- A salary is only recorded with its currency and country, and only for an offer.
  constraint application_outcomes_salary_complete
    check (
      salary_offered is null
      or (salary_currency is not null and salary_country is not null and stage = 'offer')
    )
);

create index if not exists application_outcomes_due_idx
  on public.application_outcomes (followup_due_at)
  where followup_sent_at is null and withdrawn_at is null;

create index if not exists application_outcomes_user_idx
  on public.application_outcomes (user_id);

alter table public.application_outcomes enable row level security;

-- Users see their own opt in, so the results page can show it as ticked.
drop policy if exists "Users can view own application outcome" on public.application_outcomes;
create policy "Users can view own application outcome"
on public.application_outcomes for select
using (auth.uid() = user_id);

-- Users may opt in for their own completed check only. The column defaults
-- set the token, due date and consent time; the client cannot choose them,
-- because the insert is limited to the columns granted below.
drop policy if exists "Users can opt in for own completed check" on public.application_outcomes;
create policy "Users can opt in for own completed check"
on public.application_outcomes for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.checks
    where checks.id = application_outcomes.check_id
      and checks.user_id = auth.uid()
      and checks.status = 'completed'
  )
);

-- Column level grants: an authenticated user can insert only these three
-- columns and read back only non secret ones. Everything else, including the
-- token, is service role only.
revoke all on public.application_outcomes from anon, authenticated;
grant insert (check_id, user_id, consent_version) on public.application_outcomes to authenticated;
grant select (id, check_id, user_id, consent_at, withdrawn_at, responded_at) on public.application_outcomes to authenticated;
grant select, insert, update, delete on public.application_outcomes to service_role;

comment on table public.application_outcomes is
  'Opt in application outcome follow up, one row per check. SENSITIVE. Answers arrive via submit-application-outcome using followup_token; users cannot update rows directly. Shown in the Control Centre in aggregate only.';
comment on column public.application_outcomes.followup_token is
  'Credential in the follow up email link. Never logged, exported or displayed.';

-- Atomically claims due rows for sending, so two overlapping runs can never
-- email the same person twice. A claimed row is marked sent before the email
-- goes out; a failed send is released by release_application_outcome_followup.
create or replace function public.claim_application_outcome_followups(p_limit integer)
returns table (id uuid, check_id uuid, user_id uuid, followup_token uuid)
language sql
security definer
set search_path = public
as $$
  update public.application_outcomes o
  set followup_sent_at = now(),
      followup_send_attempts = o.followup_send_attempts + 1,
      updated_at = now()
  where o.id in (
    select c.id
    from public.application_outcomes c
    where c.followup_sent_at is null
      and c.withdrawn_at is null
      and c.responded_at is null
      and c.followup_due_at <= now()
      and c.followup_send_attempts < 5
    order by c.followup_due_at
    limit greatest(1, least(p_limit, 200))
    for update skip locked
  )
  returning o.id, o.check_id, o.user_id, o.followup_token;
$$;

-- p_count_attempt false undoes the claim's attempt increment, for a row that
-- was held back (test mode) rather than tried and failed.
create or replace function public.release_application_outcome_followup(p_id uuid, p_count_attempt boolean default true)
returns void
language sql
security definer
set search_path = public
as $$
  update public.application_outcomes
  set followup_sent_at = null,
      followup_send_attempts = case
        when p_count_attempt then followup_send_attempts
        else greatest(followup_send_attempts - 1, 0)
      end,
      updated_at = now()
  where id = p_id;
$$;

revoke all on function public.claim_application_outcome_followups(integer) from public, anon, authenticated;
revoke all on function public.release_application_outcome_followup(uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_application_outcome_followups(integer) to service_role;
grant execute on function public.release_application_outcome_followup(uuid, boolean) to service_role;

-- Daily at 09:00 UTC, mirroring publish-weekly-newsletter
-- (20260907190100): pg_net calls the function with the service role key from
-- Vault. The 'service_role_key' Vault secret already exists for the jobs
-- listed in that migration. The function refuses anything but a service role
-- bearer token.
select cron.schedule(
  'send-outcome-followups',
  '0 9 * * *',
  $$
  select
    net.http_post(
      url := 'https://lqhpjluskinuocumwtml.supabase.co/functions/v1/send-outcome-followups',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    ) as request_id;
  $$
);

do $$
begin
  if (select count(*) from cron.job where jobname = 'send-outcome-followups') > 1 then
    raise exception 'more than one send-outcome-followups cron job exists';
  end if;
end
$$;
