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
as CV evidence must rule that out first: an excerpt the original, CV only
assessment already quoted is CV text; otherwise one anchored in, or sharing
at least half its content words with, the answer is candidate reported.

How to prevent recurrence
Before showing `cv_evidence`, `evidence_found` or `uvp_evidence` from a
follow up result anywhere (report, Control Centre, emails, documents),
check provenance that way. `isCandidateReportedEvidence`, with tests, is in
commit `9ad9897` on branch `feature/feedback-report-evidence-distinction`;
the report stopped listing requirement evidence in the next commit, so it
was removed rather than kept unused. The durable fix is the reassessment
recording provenance per excerpt, an Edge Function and prompt change for
the founder to decide.

Affected files or systems
The Evidence Assessment card, later the multi gap Gap Analysis card, both
since removed from the report. As of 2026-09-25 no surface renders
requirement evidence: the report's Gap Analysis shows only the follow up's
one requirement and question, `admin/src` never reads the evidence, and
`generate-documents` passes an empty array.

Source used for verification
`supabase/functions/assess-evidence-follow-up/index.ts` (reassessment input
built with `buildFollowUpCvText`); `supabase/functions/analyze-check/logic.ts`
(`buildRequirementEvidenceTable` maps `cv_evidence` to `evidence_found`,
`isGroundedInCv`); `supabase/functions/analyze-check/prompt.ts`
(`FOLLOW_UP_ADDENDUM`); invented data rendered through the real card on
localhost:5173; the tests in commit `9ad9897`.
