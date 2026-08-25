-- Redundant with pricing_pack_parity (applied remotely as 20260825110044,
-- local file 20260825130000_pricing_pack_parity.sql -- timestamps diverge
-- between local and remote for that one, pre-existing drift not touched
-- here) which already dropped the pack_id restriction entirely. This
-- migration re-applies the same "any purchased pack unlocks full history"
-- policy explicitly scoped to small/medium/large, so the two are
-- functionally equivalent and idempotent with each other.

drop policy if exists "Users can view own checks" on public.checks;

create policy "Users can view own checks"
on public.checks for select
using (
  auth.uid() = user_id
  and (
    exists (
      select 1 from public.credit_batches
      where credit_batches.user_id = auth.uid()
        and credit_batches.pack_id in ('small', 'medium', 'large')
    )
    or id = public.most_recent_check_id(auth.uid())
  )
);
