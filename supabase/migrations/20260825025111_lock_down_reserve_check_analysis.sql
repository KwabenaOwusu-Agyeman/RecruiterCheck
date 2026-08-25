-- Advisor flagged reserve_check_analysis as callable by anon/authenticated
-- via /rest/v1/rpc/reserve_check_analysis (pre-existing, not introduced by
-- the check-pack migration). Verified it's only ever called server-side
-- from analyze-check via the service-role client, never from the frontend
-- directly, so locking it down to service_role only is safe.
revoke execute on function public.reserve_check_analysis(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_check_analysis(uuid, uuid) to service_role;
