-- Two fixes to bring the credit pack system in line with the "same core
-- features on every pack" pricing model (Starter/Active/Power all get
-- Interview Score, Recruiter Feedback, Improved CV Draft, and full check
-- history; only Power additionally gets Cover Letter + Recruiter Message):
--
-- 1. complete_check_analysis previously selected any batch with
--    checks_remaining > 0, without checking expires_at -- expiry was only
--    enforced by the nightly expire_credit_batches cron (03:00 UTC), leaving
--    up to ~24h where an already expired batch could still be drawn from.
--    Now filters expired batches out directly at consumption time, so expiry
--    is enforced at the moment of use, not just by the daily sweep.
--
-- 2. Full check history was previously gated to pack_id in ('medium',
--    'large') only. Every pack now includes "Access to Check History", so
--    any user with at least one purchased batch (any pack) gets full history.

create or replace function public.complete_check_analysis(
  p_check_id uuid,
  p_user_id uuid,
  p_score integer,
  p_detected_language text,
  p_job_title text default null,
  p_company_name text default null,
  p_experience_score integer default null,
  p_skills_score integer default null,
  p_uvp_score integer default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_status check_status;
  v_lifetime_consumed integer;
  v_free_limit constant integer := 1;
  v_batch_id uuid;
  v_pack_id text;
begin
  perform 1 from profiles where id = p_user_id for update;

  select status into v_status from checks where id = p_check_id and user_id = p_user_id;
  if v_status is null then
    raise exception 'check_not_found';
  end if;

  if v_status = 'completed' then
    return;
  end if;

  select lifetime_checks_consumed into v_lifetime_consumed from profiles where id = p_user_id;

  if v_lifetime_consumed < v_free_limit then
    update checks
      set status = 'completed',
          interview_probability_score = p_score,
          detected_language = p_detected_language,
          job_title = coalesce(job_title, p_job_title),
          company_name = coalesce(company_name, p_company_name),
          experience_score = p_experience_score,
          skills_score = p_skills_score,
          uvp_score = p_uvp_score,
          error_message = null,
          funding_pack_id = null
      where id = p_check_id;

    update profiles set lifetime_checks_consumed = lifetime_checks_consumed + 1 where id = p_user_id;
    return;
  end if;

  select id, pack_id into v_batch_id, v_pack_id
    from credit_batches
    where user_id = p_user_id
      and checks_remaining > 0
      and (expires_at is null or expires_at > now())
    order by expires_at nulls last
    limit 1
    for update skip locked;

  if v_batch_id is null then
    raise exception 'no_checks_balance';
  end if;

  update checks
    set status = 'completed',
        interview_probability_score = p_score,
        detected_language = p_detected_language,
        job_title = coalesce(job_title, p_job_title),
        company_name = coalesce(company_name, p_company_name),
        experience_score = p_experience_score,
        skills_score = p_skills_score,
        uvp_score = p_uvp_score,
        error_message = null,
        funding_pack_id = v_pack_id
    where id = p_check_id;

  update credit_batches set checks_remaining = checks_remaining - 1 where id = v_batch_id;
  update profiles set checks_balance = checks_balance - 1 where id = p_user_id;

  insert into check_ledger (user_id, batch_id, entry_type, amount, related_check_id)
  values (p_user_id, v_batch_id, 'used', -1, p_check_id);
end;
$function$;

revoke execute on function public.complete_check_analysis(uuid, uuid, integer, text, text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.complete_check_analysis(uuid, uuid, integer, text, text, text, integer, integer, integer) to service_role;

drop policy if exists "Users can view own checks" on public.checks;

create policy "Users can view own checks"
on public.checks for select
using (
  auth.uid() = user_id
  and (
    exists (
      select 1 from public.credit_batches
      where credit_batches.user_id = auth.uid()
    )
    or id = public.most_recent_check_id(auth.uid())
  )
);
