Date
2026-09-26

Incorrect assumption or mistake
PR #186's `FOLLOW_UP_DOCUMENT_ADDENDUM` told the model to classify an area to
improve that a credited follow up answer covers as case (A), and in the same
paragraph not to repeat the answer outside `tailored_cv.follow_up_bullet`. It
relied on that sentence, and on the model's own `new_claims_introduced` self
audit, to keep the answer in its line. On the first live run the answer's
figure and tool also appeared in the cover letter, the CV summary and the
recruiter message.

Why it was wrong
The base system prompt in `generate-documents/index.ts` defines case (A) as
"rewrite the relevant part of the tailored_cv, cover_letter, or
recruiter_message to surface that fact clearly and prominently", so the
reclassification invited exactly the repetition the next sentence forbade.
The self audit is unreliable in both directions: the same evening one
generation failed (reason code not collected) and the next let a figure
found only in the answer through in the cover letter.

Verified correct rule
Where a credited answer's facts may appear is enforced in `validateDocuments`
(`answerOnlyFacts`, `repeatedAnswerFacts`, `FollowUpRepeatedError`), with a
correction sent on the retry, not left to the prompt. The addendum keeps case
(A) but forbids surfacing the answer anywhere except `follow_up_bullet`. A
self reported claim that the answer itself states is excused in code
(`statedInAnswer`).

Second mistake, 2026-09-26, the same evening: the first version of that
check (PR #189) only rejected and retried. The model repeated the answer's
tool on every attempt, so the founder's Generate failed outright. That was
the same mistake `validateDocuments` already records for `is_placeholder`
bullets and `stripDashes`. Since 2026-09-27 the last draft rejected for
repeating the answer is used with those sentences removed
(`followUpRepeats: 'remove'`).

How to prevent recurrence
When an addendum reuses one of the base prompt's classifications (A, B, C or
D), reread what that classification tells the model to do in every document
and override it explicitly. Any rule about which document may contain which
fact needs a check in `validateDocuments` and a test, never only a prompt
sentence or the model's self audit. A check the model may keep failing must
end in a deterministic fix of the last draft, never in retries alone. The
candidate sees reject and retry with no fallback as a 500.

Affected files or systems
`supabase/functions/generate-documents/logic.ts` (`FOLLOW_UP_DOCUMENT_ADDENDUM`,
`validateDocuments`), `supabase/functions/generate-documents/index.ts` (the
base prompt's case rules, the retry loop). Checked 2026-09-26: no other prompt
under `supabase/functions/` reuses the case classifications.

Source used for verification
The CV, cover letter and recruiter email PDFs the founder downloaded from the
live run on 2026-09-26 (an invented persona, not stored anywhere), read
against the base prompt in `generate-documents/index.ts` and the addendum as
merged in `5c93eff`.
