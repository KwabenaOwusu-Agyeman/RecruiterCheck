-- Evidence Based Recruiter Assessment: the per requirement evidence table and
-- "what may make a recruiter hesitate" doubts list shown on the results
-- page, built from the same finalized, deduplicated requirement matrix that
-- already computes the Interview Score (see buildRequirementEvidenceTable in
-- supabase/functions/analyze-check/logic.ts). Not a new scoring mechanism
-- and not a new priced feature: a restructuring of the existing Recruiter
-- Feedback, at the same pack tier entitlement as today.
--
-- Distinct from check_score_audits.evidence_references: that column is
-- internal, per subcriterion QA data with zero client grants. These columns
-- are per JD requirement, customer visible, and served through the existing
-- feedback(*) / evidence_follow_ups(*) selects getCheckWithFeedback and
-- getEvidenceFollowUp already use.
--
-- feedback.strengths/improvements/prospects are jsonb (20260807120000), so
-- the two new feedback columns follow that convention.
-- evidence_follow_ups.final_strengths/final_improvements/final_prospects are
-- text[] (20260921210000), but final_requirement_evidence holds an array of
-- objects, not strings, so it is jsonb regardless of the table's own
-- convention; final_recruiter_doubts is a plain string list and follows the
-- table's existing text[] convention. Both new evidence_follow_ups columns
-- are nullable like every other final_* column: null means "not improved",
-- set only when the follow up's reassessment raised the score (see
-- assess-evidence-follow-up/index.ts's existing
-- `outcome.improved ? analysis.X : null` pattern).
--
-- Plain ADD COLUMN only: inherits each table's existing row level security
-- and grants unchanged. No RLS change, no grant change, no RPC change.

alter table public.feedback
  add column requirement_evidence jsonb not null default '[]'::jsonb,
  add column recruiter_doubts jsonb not null default '[]'::jsonb;

alter table public.evidence_follow_ups
  add column final_requirement_evidence jsonb,
  add column final_recruiter_doubts text[];
