-- Evidence Follow Up: one optional question per completed check, and the
-- second (final) assessment it can produce.
--
-- A completed check stays immutable. Nothing here writes to `checks`,
-- `feedback` or `check_score_audits`: the initial Recruiter Score is always
-- the one on the check, and the final score lives only on this row, shown
-- beside the initial one, never merged into it.
--
-- One row per check (unique check_id) is what makes "one question, one
-- reassessment" a database fact rather than a UI convention. The row is
-- created by analyze-check when a check completes and it found a genuine
-- evidence gap, and updated only by assess-evidence-follow-up, both with the
-- service role.
--
-- Read access mirrors `feedback`: an owner can select rows joined to their
-- own checks. Owners get no insert, update or delete: they cannot write a
-- score, a status or an assessment, only ask the Edge Function to do it.
--
-- Deletion is purely FK driven. delete-account and delete-check both delete
-- `checks` rows, and on delete cascade removes the follow up with them, so
-- neither function needs to change.
create table public.evidence_follow_ups (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null unique references public.checks(id) on delete cascade,
  -- The requirement the gap was raised on, and the one sentence explaining
  -- it to the candidate. Both derived from the initial analysis.
  gap_requirement text not null,
  gap_summary text not null,
  question text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'assessed')),
  -- Self reported and unverified. Kept so the candidate can see what the
  -- final assessment was based on; never treated as CV evidence.
  candidate_answer text,
  answered_at timestamptz,
  final_score integer check (final_score is null or (final_score >= 0 and final_score <= 100)),
  final_strengths text[],
  final_improvements text[],
  final_prospects text[],
  what_changed text[],
  assessed_at timestamptz,
  created_at timestamptz not null default now(),
  -- An assessed row must carry its result; a pending one must not.
  constraint evidence_follow_ups_assessed_has_result check (
    status <> 'assessed' or (final_score is not null and candidate_answer is not null and assessed_at is not null)
  )
);

alter table public.evidence_follow_ups enable row level security;

revoke all on public.evidence_follow_ups from public, anon, authenticated;
grant select on public.evidence_follow_ups to authenticated;
grant select, insert, update on public.evidence_follow_ups to service_role;

create policy "Users can view evidence follow ups for own checks"
on public.evidence_follow_ups for select
to authenticated
using (
  exists (
    select 1 from public.checks
    where checks.id = evidence_follow_ups.check_id
      and checks.user_id = auth.uid()
  )
);
