-- Anonymised research consent.
--
-- Build item 3 of the Decision Log entry "Data strategy: what we collect, for
-- product value and exit readiness" (approved 2026-09-16). A user may allow
-- their checks to be used, with identifiers removed, to improve the product
-- and to build job market insight. Without this opt in nothing changes: their
-- checks are used to serve them and for nothing else.
--
-- Scope deliberately NOT taken: model training. The privacy policy states that
-- CVs and job descriptions are not used to train models, and the consent text
-- in src/lib/researchConsent.ts does not ask for it. Widening this needs its
-- own decision and its own consent version.
--
-- CLASSIFICATION of this table: SENSITIVE (it names users who consented).
-- The research VIEW below is the anonymised surface: no user id, no email, no
-- name, no company, no job description, no CV, no free text of any kind, and
-- dates reduced to the month. It is readable by service_role only, so it
-- reaches people through the Control Centre's audited export and nowhere else.
--
-- Withdrawal sets withdrawn_at rather than deleting the row, so a later
-- question about who consented, and until when, has an answer. A withdrawn
-- row drops out of the view immediately. Deleting the account removes the
-- row entirely, through the cascade from profiles.

create table if not exists public.research_consents (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  consent_version text not null check (length(consent_version) between 1 and 40),
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint research_consents_withdrawn_after_granted
    check (withdrawn_at is null or withdrawn_at >= granted_at)
);

create index if not exists research_consents_active_idx
  on public.research_consents (user_id)
  where withdrawn_at is null;

alter table public.research_consents enable row level security;

drop policy if exists "Users can view own research consent" on public.research_consents;
create policy "Users can view own research consent"
on public.research_consents for select
using (auth.uid() = user_id);

drop policy if exists "Users can grant own research consent" on public.research_consents;
create policy "Users can grant own research consent"
on public.research_consents for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can change own research consent" on public.research_consents;
create policy "Users can change own research consent"
on public.research_consents for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own research consent" on public.research_consents;
create policy "Users can delete own research consent"
on public.research_consents for delete
using (auth.uid() = user_id);

-- granted_at, created_at and updated_at are the database's to set. withdrawn_at
-- is writable, because withdrawing is the user's own act; the constraint above
-- stops it being set before the grant.
revoke all on public.research_consents from anon, authenticated;
grant select, delete on public.research_consents to authenticated;
grant insert (user_id, consent_version) on public.research_consents to authenticated;
grant update (consent_version, withdrawn_at) on public.research_consents to authenticated;
grant select, insert, update, delete on public.research_consents to service_role;

drop trigger if exists set_research_consents_updated_at on public.research_consents;
create trigger set_research_consents_updated_at
before update on public.research_consents
for each row execute function public.set_updated_at();

comment on table public.research_consents is
  'Opt in consent to use a user''s checks, anonymised, for product improvement and job market insight. SENSITIVE: it identifies who consented. Withdrawal sets withdrawn_at and removes them from research_checks at once. Does NOT cover model training.';

-- ---------------------------------------------------------------------------
-- The anonymised research surface.
-- ---------------------------------------------------------------------------
--
-- One row per completed check belonging to a user whose consent is live.
-- What it deliberately leaves out: user_id, email, name, company_name,
-- job_description, cv_file_name, cv_storage_path, the report text, the scoring
-- internals in check_score_audits, and the free text target_role and comments.
-- What it reduces: exact timestamps become the first of the month, and years of
-- experience becomes a band, so no row can be matched back by timing alone.
--
-- job_title is kept: it is the unit of analysis for every job market question
-- this dataset exists to answer, and it describes a role rather than a person.
-- It is the one free-ish text field here, so it is lower cased, trimmed and
-- its inner runs of whitespace collapsed, which keeps it a category rather
-- than a sentence: "Data   Analyst" and "data analyst" must group together.
create or replace view public.research_checks
with (security_invoker = true)
as
select
  c.id as check_id,
  date_trunc('month', c.created_at)::date as check_month,
  nullif(regexp_replace(lower(btrim(c.job_title)), '\s+', ' ', 'g'), '') as job_title,
  c.interview_probability_score as score,
  c.experience_score,
  c.skills_score,
  c.uvp_score,
  c.output_language,
  b.seniority,
  b.country,
  case
    when b.years_experience is null then null
    when b.years_experience < 1 then 'under_1'
    when b.years_experience <= 3 then '1_to_3'
    when b.years_experience <= 6 then '4_to_6'
    when b.years_experience <= 10 then '7_to_10'
    else 'over_10'
  end as experience_band,
  b.industry,
  b.employment_status,
  b.education_level,
  b.needs_work_permit,
  o.applied,
  o.channel as application_channel,
  o.stage as application_stage,
  o.days_to_reply,
  o.salary_offered,
  o.salary_currency,
  o.salary_country
from public.checks c
join public.research_consents rc
  on rc.user_id = c.user_id and rc.withdrawn_at is null
left join public.user_profile_basics b on b.user_id = c.user_id
left join public.application_outcomes o
  on o.check_id = c.id and o.responded_at is not null
where c.status = 'completed';

revoke all on public.research_checks from anon, authenticated;
grant select on public.research_checks to service_role;

comment on view public.research_checks is
  'Anonymised research dataset: completed checks of users whose research consent is live. No identifiers, no free text but a normalised job title, dates reduced to the month, experience in bands. service_role only; reaches people through the Control Centre export, which is audited.';
