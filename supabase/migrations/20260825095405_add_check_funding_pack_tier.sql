-- Re-introduces tiered document entitlement (Small = score + feedback only,
-- Medium = + CV draft, Large = + cover letter + recruiter message), this
-- time keyed on which pack funded the specific check rather than a
-- subscription tier on the profile. complete_check_analysis already knows
-- which batch (if any) funded a paid check -- this just also records that
-- batch's pack_id directly on the check row, so generate-documents can read
-- entitlement with a single row lookup instead of a ledger join. A check
-- funded by the free lifetime allowance gets no pack tier (treated as
-- Small-equivalent: score + feedback only), matching how the free tier has
-- always worked.

alter table public.checks
  add column funding_pack_id text;

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
    where user_id = p_user_id and checks_remaining > 0
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
