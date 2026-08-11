-- Allow anonymous (pre-signup) analytics events so the conversion funnel can
-- be measured from the landing page onward, not just inside the
-- authenticated app. Narrowly scoped: user_id becomes nullable, and the new
-- anon policy only permits INSERT with user_id IS NULL (no SELECT/UPDATE/
-- DELETE grant, no change to the existing authenticated policy).

alter table public.analytics_events
  alter column user_id drop not null;

create policy "Anonymous can insert analytics events"
  on public.analytics_events
  for insert
  to anon
  with check (user_id is null);
