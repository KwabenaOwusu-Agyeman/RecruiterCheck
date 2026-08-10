-- New Check no longer asks for Job Title/Company manually (per the
-- simplified-form product decision): analyze-check now extracts them from
-- the job description itself as part of its single structured-output call,
-- and this RPC persists them alongside the score/language it already wrote.
-- Nullable by design — if extraction can't confidently find a title or
-- company, the field stays null rather than a placeholder, and downstream
-- document generation already handles a null company gracefully (empty
-- address block, generic salutation).
--
-- Adding parameters changes the function's signature, so `create or replace`
-- would leave the old 4-arg overload in place alongside this one rather than
-- replacing it — drop it explicitly first.
drop function if exists public.complete_check_analysis(uuid, uuid, integer, text);

create or replace function public.complete_check_analysis(
  p_check_id uuid,
  p_user_id uuid,
  p_score integer,
  p_detected_language text,
  p_job_title text default null,
  p_company_name text default null
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
        -- Only fill in when not already set (e.g. from an extension
        -- capture, which already extracted these reliably from the page
        -- DOM) — never overwrite a known-good value with a fresh guess.
        job_title = coalesce(job_title, p_job_title),
        company_name = coalesce(company_name, p_company_name),
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

revoke execute on function public.complete_check_analysis(uuid, uuid, integer, text, text, text) from public;
grant execute on function public.complete_check_analysis(uuid, uuid, integer, text, text, text) to service_role;
