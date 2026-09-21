-- ============================================================================
-- Lock down client writes to public.checks, stop exposing testimonial authors,
-- and let the stale-check sweep actually run.
--
-- Found in the 2026-09-21 production audit and reproduced on a local replay of
-- every migration in this directory (Postgres 16, Supabase roles stubbed):
--
-- 1. public.checks: the "Users can update own checks" policy allows any
--    column, and protect_check_analysis_fields only reverted status, scores,
--    detected_language and error_message. A signed-in user could therefore:
--      - set funding_pack_id = 'large' on a free check and receive the Power
--        pack documents from generate-documents;
--      - point cv_storage_path at another user's object, which analyze-check
--        and generate-documents then download with the service role, and
--        which delete-check then deletes;
--      - rewrite job_description / job_title / company_name on a completed
--        check and generate documents for a different job without a credit;
--      - back-date created_at or set uploads_purged to keep their files past
--        the 24 hour purge, or starve the purge queue.
--    The only legitimate client writes (src/services/checkService.ts) are:
--    INSERT of a draft with cv_storage_path = '<uid>/<checkId>.<ext>', and
--    UPDATE of a DRAFT's job_title, company_name, job_description,
--    cv_storage_path ('<uid>/<checkId>-<ms>.<ext>') and cv_file_name.
--    This migration allows exactly that and nothing else.
--
-- 2. protect_check_analysis_fields treated pg_cron as a client, because cron
--    sessions carry no JWT claims. sweep_stale_processing_checks() therefore
--    had its status change silently reverted, and set_updated_at bumped
--    updated_at on every run, so a crashed check stayed 'processing' for good
--    and kept blocking reserve_check_analysis for its owner most of the time.
--    The same bug on profiles was fixed in 20260828064337; the exemption
--    below is that migration's exact condition, including its production
--    precondition on the role graph (re-run the query recorded there).
--
-- 3. A new CV attached to a draft restarts the retention clock. Before this,
--    a draft resumed after the 24 hour purge had uploads_purged = true, so
--    the new CV, job description and generated documents were never purged.
--
-- 4. product_feedback: the "Public can view consented feedback" policy let
--    anon read every column of consented rows, including email, user_id and
--    check_id, over /rest/v1/product_feedback. RLS filters rows, not columns.
--    The public view is rebuilt over a SECURITY DEFINER function that returns
--    only the five display columns, so the landing page code is unchanged and
--    the base table is no longer readable by anyone but its owner.
--
-- 5. check_sentiment: the UPDATE policy did not re-check that check_id still
--    belongs to the caller, so a row could be repointed at another user's
--    check.
--
-- 6. checks.detected_language exists in production (it is in the generated
--    types and is written by complete_check_analysis) but no migration ever
--    created it, so a local replay failed every client UPDATE of checks.
--    Added idempotently; a no-op in production.
-- ============================================================================

alter table public.checks add column if not exists detected_language text;

create or replace function public.protect_check_analysis_fields()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  -- Trusted writers: the service role (Edge Functions, SECURITY DEFINER RPCs
  -- they call) and internal maintenance sessions such as pg_cron, identified
  -- exactly as in protect_profile_billing_fields (20260828064337).
  if auth.role() is not distinct from 'service_role'
     or (
       current_user = 'postgres'
       and session_user = 'postgres'
       and current_setting('request.jwt.claims', true) is null
     )
  then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A non-draft status at insert time can only mean a client is trying to
    -- fabricate an already-completed check: reject rather than coerce.
    if new.status is distinct from 'draft' then
      raise exception 'insufficient_privilege: only the trusted backend may create a check with status %', new.status
        using errcode = '42501';
    end if;
    if split_part(coalesce(new.cv_storage_path, ''), '/', 1) is distinct from new.user_id::text then
      raise exception 'insufficient_privilege: cv_storage_path must be inside the caller''s own folder'
        using errcode = '42501';
    end if;
    new.interview_probability_score := null;
    new.experience_score := null;
    new.skills_score := null;
    new.uvp_score := null;
    new.detected_language := null;
    new.error_message := null;
    new.funding_pack_id := null;
    new.trustpilot_notified_at := null;
    new.created_at := now();
    new.uploads_purged := false;
    new.uploads_purged_at := null;
    new.upload_purge_attempts := 0;
    new.documents_purged := false;
    new.documents_purged_at := null;
    return new;
  end if;

  -- UPDATE. Analysis results and server bookkeeping are never client-writable.
  new.status := old.status;
  new.interview_probability_score := old.interview_probability_score;
  new.experience_score := old.experience_score;
  new.skills_score := old.skills_score;
  new.uvp_score := old.uvp_score;
  new.detected_language := old.detected_language;
  new.error_message := old.error_message;
  new.user_id := old.user_id;
  new.funding_pack_id := old.funding_pack_id;
  new.trustpilot_notified_at := old.trustpilot_notified_at;
  new.created_at := old.created_at;
  new.uploads_purged := old.uploads_purged;
  new.uploads_purged_at := old.uploads_purged_at;
  new.upload_purge_attempts := old.upload_purge_attempts;
  new.documents_purged := old.documents_purged;
  new.documents_purged_at := old.documents_purged_at;

  if old.status is distinct from 'draft' then
    -- Once submitted, what was checked is fixed: documents are generated from
    -- this exact job and CV, and the check has been paid for.
    new.job_title := old.job_title;
    new.company_name := old.company_name;
    new.job_description := old.job_description;
    new.cv_storage_path := old.cv_storage_path;
    new.cv_file_name := old.cv_file_name;
    new.output_language := old.output_language;
  elsif new.cv_storage_path is distinct from old.cv_storage_path then
    if split_part(coalesce(new.cv_storage_path, ''), '/', 1) is distinct from old.user_id::text then
      raise exception 'insufficient_privilege: cv_storage_path must be inside the caller''s own folder'
        using errcode = '42501';
    end if;
    -- A new CV restarts the 24 hour retention clock, and clears the flags a
    -- purge may already have set on this draft so the new files are purged.
    new.created_at := now();
    new.uploads_purged := false;
    new.uploads_purged_at := null;
    new.upload_purge_attempts := 0;
    new.documents_purged := false;
    new.documents_purged_at := null;
  end if;

  return new;
end;
$function$;

revoke execute on function public.protect_check_analysis_fields() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Testimonials: public display columns only, through a definer function.
-- ---------------------------------------------------------------------------
drop policy if exists "Public can view consented feedback" on public.product_feedback;

-- anon never needs the base table: the only public read is the view below.
revoke all on public.product_feedback from anon;

create or replace function public.get_public_testimonials()
returns table (
  rating smallint,
  comment text,
  display_name text,
  target_role text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select pf.rating, pf.comment, pf.display_name, pf.target_role, pf.created_at
  from public.product_feedback pf
  where pf.feature_consent = true
    and pf.comment is not null
    and pf.display_name is not null
  order by pf.created_at desc
$function$;

revoke execute on function public.get_public_testimonials() from public;
grant execute on function public.get_public_testimonials() to anon, authenticated, service_role;

comment on function public.get_public_testimonials() is
  'The only public read of product_feedback: consented rows, five display columns. Never add email, user_id or check_id.';

-- Same name, columns and types as before, so src/services/testimonialsService.ts
-- is unchanged. security_invoker stays on: the view itself bypasses nothing;
-- the function it calls returns only safe columns.
create or replace view public.public_testimonials
with (security_invoker = true)
as
select rating, comment, display_name, target_role, created_at
from public.get_public_testimonials();

comment on view public.public_testimonials is
  'Public-safe subset of product_feedback, served by get_public_testimonials(). Never add email, user_id, or check_id.';

grant select on public.public_testimonials to anon, authenticated;

-- ---------------------------------------------------------------------------
-- check_sentiment: an update must keep pointing at the caller's own check.
-- ---------------------------------------------------------------------------
drop policy if exists "Users can update own check sentiment" on public.check_sentiment;
create policy "Users can update own check sentiment"
  on public.check_sentiment
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.checks c
      where c.id = check_sentiment.check_id
        and c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Post-conditions: fail the migration rather than leave a half-applied state.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'product_feedback'
      and 'anon' = any (roles)
  ) then
    raise exception 'product_feedback still has a policy granted to anon';
  end if;
  if has_table_privilege('anon', 'public.product_feedback', 'SELECT') then
    raise exception 'anon still holds SELECT on product_feedback';
  end if;
  if has_function_privilege('anon', 'public.protect_check_analysis_fields()', 'EXECUTE') then
    raise exception 'protect_check_analysis_fields is executable by anon';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'checks_protect_analysis_fields'
      and tgrelid = 'public.checks'::regclass
      and tgenabled = 'O'
  ) then
    raise exception 'checks_protect_analysis_fields trigger is missing or disabled';
  end if;
end $$;
