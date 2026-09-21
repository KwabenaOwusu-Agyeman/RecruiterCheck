-- Minimal stand-ins for the Supabase platform objects the migrations rely on:
-- roles, auth.uid()/auth.role()/auth.jwt(), auth.users, storage tables and
-- foldername(), pg_cron (cron.schedule/unschedule, cron.job), pg_net
-- (net.http_post, a no-op) and Vault. Used only by scripts/local-db/replay.sh
-- against a throwaway local cluster. Never run this against a real project.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit;
create role supabase_admin nologin;
grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to postgres;

create schema auth; create schema storage; create schema extensions; create schema cron; create schema net; create schema vault;
grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(), aud text, role text, email text, encrypted_password text,
  email_confirmed_at timestamptz, confirmed_at timestamptz, last_sign_in_at timestamptz,
  raw_app_meta_data jsonb default '{}'::jsonb, raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now(), phone text,
  banned_until timestamptz, deleted_at timestamptz, is_anonymous boolean default false, is_sso_user boolean default false
);
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, provider text, created_at timestamptz default now(), last_sign_in_at timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select auth.jwt() ->> 'role' $$;
create function auth.email() returns text language sql stable as $$ select auth.jwt() ->> 'email' $$;
grant select on auth.users to service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[], owner uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, owner_id text, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now(), last_accessed_at timestamptz);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
create function storage.filename(name text) returns text language sql immutable as $$ select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;
create function storage.extension(name text) returns text language sql immutable as $$ select reverse(split_part(reverse(name), '.', 1)) $$;

create table cron.job (jobid bigserial primary key, schedule text, command text, nodename text default 'localhost', nodeport int default 5432, database text default current_database(), username text default current_user, active boolean default true, jobname text);
create table cron.job_run_details (runid bigserial primary key, jobid bigint, status text, return_message text, start_time timestamptz, end_time timestamptz);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language plpgsql as $$
declare v bigint; begin
  update cron.job set schedule = $2, command = $3 where jobname = $1 returning jobid into v;
  if v is null then insert into cron.job (jobname, schedule, command) values ($1, $2, $3) returning jobid into v; end if;
  return v; end $$;
create function cron.schedule(schedule text, command text) returns bigint language sql as $$ insert into cron.job (schedule, command) values ($1, $2) returning jobid $$;
create function cron.unschedule(job_id bigint) returns boolean language sql as $$ with d as (delete from cron.job where jobid = $1 returning 1) select exists(select 1 from d) $$;
create function cron.unschedule(job_name text) returns boolean language sql as $$ with d as (delete from cron.job where jobname = $1 returning 1) select exists(select 1 from d) $$;

create table net._http_response (id bigint, status_code int, content text, timed_out boolean, error_msg text, created timestamptz default now());
create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000) returns bigint language sql as $$ select 1::bigint $$;
create function net.http_get(url text, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000) returns bigint language sql as $$ select 1::bigint $$;

create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text, description text);
create view vault.decrypted_secrets as select id, name, secret as decrypted_secret, description from vault.secrets;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '') returns uuid language sql as $$ insert into vault.secrets (name, secret, description) values ($2, $1, $3) returning id $$;
