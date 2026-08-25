-- Advisor flagged get_check_count as callable by anon via
-- /rest/v1/rpc/get_check_count -- the earlier gate_check_history_by_pack
-- migration only revoked from `public`, which (per the same lesson learned
-- with expire_credit_batches) doesn't clear Supabase's default per-role
-- grants. Low risk since the function already self-scopes to
-- p_user_id = auth.uid() (an anon caller has no auth.uid(), so it always
-- returns 0), but locking it down properly for consistency.
revoke execute on function public.get_check_count(uuid) from anon;
