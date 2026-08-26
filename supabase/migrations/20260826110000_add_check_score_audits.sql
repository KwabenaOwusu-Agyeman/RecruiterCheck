-- Adds a private, internal-only audit trail for how a check's score was
-- computed, WITHOUT touching the user-readable `checks` table at all.
-- Superseded design decision: an earlier draft of this migration added a
-- `score_breakdown` jsonb column directly to `checks`. That was never
-- applied (verified against production before writing this file) and is
-- replaced here because `checks` already grants its owner row-level SELECT
-- access (see "Users can view own checks"), and RLS in Postgres is
-- row-level, not column-level -- a new column on that table would have
-- been visible to the check's own owner with no way to hide it that
-- doesn't fight the existing policy. A separate table with its own RLS
-- (enabled, zero policies) and zero grants to anon/authenticated is the
-- clean way to keep this genuinely internal.
--
-- Deliberately excludes anything that would duplicate sensitive candidate
-- data already stored elsewhere (the CV file, the job description, the
-- user's profile): no CV excerpts, no job description excerpts, no name,
-- email, or phone number, no full AI prompt, no raw AI response. Every
-- subcriterion's "reason" is a short, template-derived sentence keyed only
-- by its strong/partial/none level (see buildScoreBreakdown in logic.ts)
-- -- never anything quoted from the candidate's own CV.
create table public.check_score_audits (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.checks(id) on delete cascade,
  rubric_version text not null,
  prompt_version text not null,
  model_identifier text,
  scoring_method text not null,
  subcriteria jsonb not null,
  category_totals jsonb not null,
  -- The structured "where did this come from" pointer for each evidence
  -- dependent subcriterion (applied_evidence, applied_skill,
  -- skill_application, results, tools_platforms): { cv_section,
  -- entry_reference, evidence_type } per field. entry_reference is a short
  -- label (e.g. "Project: Sales Dashboard"), never a verbatim CV quotation
  -- -- see EvidenceReference in logic.ts. Defaults to '{}' for forward
  -- compatibility with any future column addition, not because an empty
  -- reference set is expected in practice.
  evidence_references jsonb not null default '{}'::jsonb,
  final_score integer not null,
  calculated_at timestamptz not null,
  created_at timestamptz not null default now(),

  -- One audit row per check, ever. Combined with the ON CONFLICT DO NOTHING
  -- in complete_check_analysis_with_audit below, this is what makes a
  -- duplicate invocation (a network retry after the first call actually
  -- succeeded server-side) a harmless no-op instead of a second row.
  constraint check_score_audits_check_id_unique unique (check_id),

  -- scoring_method is a TypeScript literal type ('detailed_rubric') at the
  -- application layer (see ScoringMethod in logic.ts) with exactly one
  -- value today; mirrored here as a hard constraint so a future bug can't
  -- silently write an unrecognized method string.
  constraint check_score_audits_scoring_method_valid check (scoring_method = 'detailed_rubric'),
  constraint check_score_audits_subcriteria_is_object check (jsonb_typeof(subcriteria) = 'object'),
  constraint check_score_audits_category_totals_is_object check (jsonb_typeof(category_totals) = 'object'),
  constraint check_score_audits_evidence_references_is_object check (jsonb_typeof(evidence_references) = 'object'),
  constraint check_score_audits_final_score_range check (final_score >= 0 and final_score <= 100)
);

comment on table public.check_score_audits is
  'Internal scoring QA/debugging only. No candidate PII, no CV/job description text, no raw AI output. Not exposed to anon or authenticated roles.';

-- Belt and suspenders, deliberately not one or the other: REVOKE removes
-- the table-level privilege outright (so even a future policy mistake
-- can't leak a row), and RLS with zero policies denies by default for any
-- role that somehow still had a grant. service_role bypasses RLS in
-- Supabase (its BYPASSRLS attribute), so it is unaffected by either.
alter table public.check_score_audits enable row level security;
revoke all on public.check_score_audits from public, anon, authenticated;
grant select, insert on public.check_score_audits to service_role;
-- No CREATE POLICY statements at all, intentionally: an end user must never
-- be able to select, insert, update, or delete a row in this table, by any
-- route.

-- The existing complete_check_analysis(uuid, uuid, integer, text, text,
-- text, integer, integer, integer) -- confirmed via pg_proc /
-- pg_get_function_identity_arguments against production immediately before
-- writing this migration to be the one and only overload of that name --
-- is NOT modified by this migration. Its signature, behavior, grants, and
-- callers are all unchanged. This new function wraps it instead of
-- extending it, so no existing caller can ever be pointed at a different
-- signature or an ambiguous overload.
create or replace function public.complete_check_analysis_with_audit(
  p_check_id uuid,
  p_user_id uuid,
  p_score integer,
  p_detected_language text,
  p_job_title text default null,
  p_company_name text default null,
  p_experience_score integer default null,
  p_skills_score integer default null,
  p_uvp_score integer default null,
  p_rubric_version text default null,
  p_prompt_version text default null,
  p_model_identifier text default null,
  p_scoring_method text default null,
  p_subcriteria jsonb default null,
  p_category_totals jsonb default null,
  p_evidence_references jsonb default null,
  p_calculated_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  -- Runs first so a genuinely failed completion (e.g. no_checks_balance,
  -- check_not_found) raises before any audit row is even attempted.
  perform public.complete_check_analysis(
    p_check_id,
    p_user_id,
    p_score,
    p_detected_language,
    p_job_title,
    p_company_name,
    p_experience_score,
    p_skills_score,
    p_uvp_score
  );

  -- Both statements above and below run inside this function's own
  -- implicit transaction. If the insert raises for any reason other than
  -- the intentional ON CONFLICT no-op (e.g. a check constraint violation),
  -- everything complete_check_analysis just did -- status, score columns,
  -- credit consumption, the check_ledger insert -- rolls back with it.
  -- Callers that have no audit payload at all (p_scoring_method null) skip
  -- the insert entirely rather than writing a half-empty row.
  if p_scoring_method is not null then
    insert into public.check_score_audits (
      check_id, rubric_version, prompt_version, model_identifier,
      scoring_method, subcriteria, category_totals, evidence_references, final_score, calculated_at
    )
    values (
      p_check_id, p_rubric_version, p_prompt_version, p_model_identifier,
      p_scoring_method, p_subcriteria, p_category_totals, coalesce(p_evidence_references, '{}'::jsonb), p_score,
      coalesce(p_calculated_at, now())
    )
    on conflict (check_id) do nothing;
  end if;
end;
$function$;

revoke execute on function public.complete_check_analysis_with_audit(
  uuid, uuid, integer, text, text, text, integer, integer, integer,
  text, text, text, text, jsonb, jsonb, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.complete_check_analysis_with_audit(
  uuid, uuid, integer, text, text, text, integer, integer, integer,
  text, text, text, text, jsonb, jsonb, jsonb, timestamptz
) to service_role;
