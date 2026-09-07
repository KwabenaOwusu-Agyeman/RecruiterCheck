-- Archive of every weekly newsletter issue the publish-weekly-newsletter job
-- builds, whether it went out or failed trying.
--
-- It exists because the job runs in an edge function and an edge function
-- cannot write to the repo. Before automation the record of an issue was the
-- committed week<N>.html file; this replaces it, and does three jobs the file
-- did not:
--
--   1. Idempotence. (year, week) is unique, so a retried or manually invoked
--      run cannot create a second campaign for a week that already has one.
--   2. Dedupe. The postings of recent issues are read back so the same role is
--      never sent twice. Repeating a role a subscriber saw a fortnight ago is
--      the most likely way an unattended job embarrasses itself.
--   3. A failure record the Control Centre can alert on, so a week that did
--      not go out is visible rather than silent.
--
-- CLASSIFICATION: this holds no candidate data. The postings are public job
-- adverts scraped from public feeds, and every word of prose is generated. No
-- subscriber, no email address, no check, no CV. It is service-role-only
-- anyway, because there is no reason for a browser to read it.

create table public.newsletter_issues (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  week integer not null check (week between 1 and 53),
  status text not null check (status in ('scheduled', 'failed')),
  subject text,
  html text,
  postings jsonb not null default '[]'::jsonb,
  rejection_heading text,
  campaign_id bigint,
  scheduled_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (year, week)
);

alter table public.newsletter_issues enable row level security;

-- RLS on with zero policies, which is the service-role-only pattern used by
-- newsletter_subscribers and check_score_audits. The revoke runs first and
-- names service_role explicitly: Supabase's default privileges grant the role
-- full access at creation time, so granting afterwards without revoking first
-- leaves UPDATE and DELETE behind that nobody intended. That exact mistake was
-- made once already on admin_audit_log.
revoke all on table public.newsletter_issues from public, anon, authenticated, service_role;
grant select, insert, update on table public.newsletter_issues to service_role;

create trigger newsletter_issues_set_updated_at
before update on public.newsletter_issues
for each row execute function public.set_updated_at();

-- The dedupe and alerting reads are both "recent issues, newest first".
create index newsletter_issues_created_at_idx
  on public.newsletter_issues (created_at desc);

comment on table public.newsletter_issues is
  'One row per weekly newsletter issue built by publish-weekly-newsletter. Service-role only: RLS enabled with no policies. Contains no candidate data, no subscriber data and no email addresses; postings are public job adverts and all prose is generated. (year, week) is unique so a re-run cannot double send.';

comment on column public.newsletter_issues.status is
  'scheduled means a Brevo campaign was created and will send at scheduled_at. failed means the run aborted and nothing was created; error says why.';

comment on column public.newsletter_issues.postings is
  'The five postings as sent, each with role, company, location, url and note. Read back by later runs to avoid repeating a role.';

comment on column public.newsletter_issues.campaign_id is
  'Brevo campaign id. Cancelling a scheduled issue is done in Brevo against this id.';
