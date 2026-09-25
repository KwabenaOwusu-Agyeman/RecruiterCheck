Date
2026-09-25

Incorrect assumption or mistake
The Evidence Assessment card labelled every row's `evidence_found` as "CV
evidence", assuming the requirement matrix only ever quotes the CV. After a
credited Evidence Follow Up it shows the reassessed matrix, and that
reassessment can quote the candidate's own answer, so self reported words
could appear under a "CV evidence" label.

Why it was wrong
`assess-evidence-follow-up` runs the same `normalizeAnalysis` on
`buildFollowUpCvText(...)`, the CV with the answer appended, and
`FOLLOW_UP_ADDENDUM` tells the model to treat a credited answer as an entry
the CV did not show. `isGroundedInCv` accepts an excerpt anchored in, or
overlapping, that combined text. Nothing records which part an excerpt came
from, and the field is still named `cv_evidence`.

Verified correct rule
Excerpt text from a reassessed result (`final_requirement_evidence` and the
matrix behind it) may be the candidate's answer. Any surface that labels it
as CV evidence must rule that out first. Since 2026-09-26 no surface shows
reassessed excerpts at all: Gap Analysis reads only the CV only assessment
(`feedback.requirement_evidence`), and the answer appears once, labelled, in
the follow up card.

How to prevent recurrence
Before showing `cv_evidence`, `evidence_found` or `uvp_evidence` from a
follow up result anywhere (report, Control Centre, emails, documents), check
provenance first. `isCandidateReportedEvidence` (in `src/lib/gapAnalysis.ts`
at commit `9ad9897`, removed once unused) is a tested starting point: an
excerpt the CV only assessment already quoted is CV text; otherwise one
anchored in, or sharing at least half its content words with, the answer is
candidate reported. The durable fix is the reassessment recording provenance
per excerpt, an Edge Function and prompt change for the founder to decide.

Affected files or systems
`src/components/feedback/GapAnalysisCard.tsx` (formerly
`EvidenceAssessmentCard.tsx`), `src/lib/gapAnalysis.ts`, `src/pages/FeedbackPage.tsx`.
Checked 2026-09-26 that no surface renders reassessed requirement evidence:
`admin/src` never reads it, `generate-documents` passes an empty array, and
the report reads only `feedback.requirement_evidence`.

Source used for verification
`supabase/functions/assess-evidence-follow-up/index.ts` (reassessment input
built with `buildFollowUpCvText`); `supabase/functions/analyze-check/logic.ts`
(`buildRequirementEvidenceTable` maps `cv_evidence` to `evidence_found`,
`isGroundedInCv`); `supabase/functions/analyze-check/prompt.ts`
(`FOLLOW_UP_ADDENDUM`); invented data rendered through the real card on
localhost:5173; `src/lib/gapAnalysis.test.ts`.
