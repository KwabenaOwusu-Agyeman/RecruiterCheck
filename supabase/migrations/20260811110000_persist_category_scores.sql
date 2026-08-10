-- Interview Probability Score is Experience(40) + Skills(35) + UVP(25), but
-- the per-category breakdown was computed in analyze-check and then
-- discarded — never persisted, so neither the app nor support could ever
-- see or audit why a check scored the way it did. This persists all three
-- alongside the final score.
alter table public.checks
  add column experience_score integer
    check (experience_score is null or (experience_score >= 0 and experience_score <= 100)),
  add column skills_score integer
    check (skills_score is null or (skills_score >= 0 and skills_score <= 100)),
  add column uvp_score integer
    check (uvp_score is null or (uvp_score >= 0 and uvp_score <= 100));

drop function if exists public.complete_check_analysis(uuid, uuid, integer, text, text, text);

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
  v_tier subscription_tier;
  v_today date := (now() at time zone 'utc')::date;
begin
  perform 1 from profiles where id = p_user_id for update;

  select status into v_status from checks where id = p_check_id and user_id = p_user_id;
  if v_status is null then
    raise exception 'check_not_found';
  end if;

  if v_status = 'completed' then
    return;
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
        error_message = null
    where id = p_check_id;

  select subscription_tier into v_tier from profiles where id = p_user_id;

  if v_tier = 'free' then
    update profiles set lifetime_checks_consumed = lifetime_checks_consumed + 1 where id = p_user_id;
  else
    update profiles
      set daily_checks_consumed = case when daily_checks_reset_at = v_today then daily_checks_consumed + 1 else 1 end,
          daily_checks_reset_at = v_today
      where id = p_user_id;
  end if;
end;
$function$;

revoke execute on function public.complete_check_analysis(uuid, uuid, integer, text, text, text, integer, integer, integer) from public;
grant execute on function public.complete_check_analysis(uuid, uuid, integer, text, text, text, integer, integer, integer) to service_role;
