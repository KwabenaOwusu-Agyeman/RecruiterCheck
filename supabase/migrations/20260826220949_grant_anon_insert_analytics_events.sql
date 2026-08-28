-- anon had no table-level grants at all on analytics_events (no INSERT,
-- SELECT, UPDATE, DELETE, or TRUNCATE), despite the correct "Anonymous can
-- insert analytics events" RLS policy already existing for it. Postgres
-- checks table-level GRANTs before RLS, so every anonymous analytics insert
-- was rejected regardless of the policy. This grants exactly the one
-- permission the existing policy already assumes anon has -- nothing more.
-- RLS itself, and every existing policy, is unchanged.
grant insert on table public.analytics_events to anon;
