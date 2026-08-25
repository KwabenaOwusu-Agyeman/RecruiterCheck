-- is_most_recent_check existed solely to power the old tier-based "Users can
-- view own checks" SELECT policy (fix_check_insert_rls_returning.sql). The
-- check_pack_system migration already replaced that policy with a plain
-- auth.uid() = user_id check (full history for everyone, no tier left to
-- gate by) — confirmed via pg_policies that no policy references this
-- function any more, and nothing in the app calls it directly. It's dead
-- code, not just an over-permissioned one; drop it rather than lock it down.
drop function if exists public.is_most_recent_check(uuid, timestamptz);
