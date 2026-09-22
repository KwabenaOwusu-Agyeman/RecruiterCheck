// Evidence Follow Up: the pure, testable parts.
//
// After a check completes, the initial analysis names the single most
// important evidence gap and the candidate is offered ONE question about it.
// Their answer is added to the CV text as a clearly labelled, self reported
// section and the same analysis and scoring pipeline runs once more (see
// assess-evidence-follow-up). Nothing here scores anything: the score always
// comes from normalizeAnalysis, exactly as for the initial check.
//
// Pure module: no Deno, no network, no environment access. It has no runtime
// import from logic.ts (logic.ts imports this file), so the two cannot form
// an import cycle.

import type { RawRequirement } from './logic.ts'

export interface EvidenceGap {
  // The requirement the gap was raised on, cleaned for display.
  requirement: string
  // One sentence for the candidate: what the recruiter is missing.
  summary: string
  // The single follow up question. Asks only about something that may
  // already be true; never suggests what a good answer would contain.
  question: string
}

const MAX_REQUIREMENT_CHARS = 120

const IMPORTANCE_ORDER = { must_have: 0, important: 1, nice_to_have: 2 } as const
// Within one importance tier a partial match ranks first: the CV already
// gestures at it, so evidence that exists but was not shown is most likely.
const STRENGTH_ORDER = { partial: 0, none: 1, strong: 2 } as const

function displayName(requirement: string, clean: (text: string) => string): string {
  const trimmed = clean(requirement.trim().replace(/[.!?]+$/, ''))
  return trimmed.length > MAX_REQUIREMENT_CHARS ? `${trimmed.slice(0, MAX_REQUIREMENT_CHARS).trimEnd()}` : trimmed
}

/**
 * Picks the one gap worth asking about, or null when nothing clears the bar.
 *
 * `requirements` must already be the deduplicated, grounding checked matrix
 * with application stage and post hire items removed (availability, work
 * authorisation and private identifiers are confirmed in an application
 * form, not evidenced by a CV, so a follow up about them would be wrong).
 * A requirement only qualifies when the CV did not fully evidence it and it
 * is at least "important": a missing nice to have is never worth the
 * candidate's one question.
 *
 * Ranking: critical gaps first, then must have before important, then a
 * partial match before no match, then the order the model listed them.
 */
export function selectEvidenceGap(
  requirements: RawRequirement[],
  clean: (text: string) => string = (text) => text,
): EvidenceGap | null {
  const candidates = requirements
    .map((requirement, index) => ({ requirement, index }))
    .filter(
      ({ requirement }) =>
        requirement.match_strength !== 'strong' &&
        requirement.importance !== 'nice_to_have' &&
        displayName(requirement.requirement, clean).length > 0,
    )
    .sort(
      (a, b) =>
        Number(b.requirement.critical) - Number(a.requirement.critical) ||
        IMPORTANCE_ORDER[a.requirement.importance] - IMPORTANCE_ORDER[b.requirement.importance] ||
        STRENGTH_ORDER[a.requirement.match_strength] - STRENGTH_ORDER[b.requirement.match_strength] ||
        a.index - b.index,
    )

  const top = candidates[0]?.requirement
  if (!top) return null

  const name = displayName(top.requirement, clean)
  // Short on purpose: this sits as a small framing line above the question
  // itself, which carries the actual detail. Still draws the same partial
  // versus no evidence distinction as before, just in a handful of words.
  const summary = top.match_strength === 'partial' ? `Some evidence for ${name}, not enough.` : `No evidence for ${name} yet.`
  // `name` is the model's own extracted requirement text (raw RawRequirement.
  // requirement), and the extraction prompt's own examples show it is
  // routinely a full phrase such as "Experience with Salesforce" or "5+
  // years in B2B product marketing", never guaranteed to be a bare skill or
  // activity name. A template that embeds `name` as the grammatical object
  // of "used" or "experience of" breaks on that phrasing (a live check
  // produced "Have you used Experience with SQL for reporting in a
  // project..."). Both branches below instead open with "The job asks for
  // ${name}", the same safe pattern the "no evidence" summary above already
  // uses, so the sentence stays grammatical for any phrasing the model
  // produces. Still exactly one question mark, and still names no example
  // answer. Kept short on purpose: one short opening statement, then one
  // short question.
  const question =
    top.category === 'skills'
      ? `The job asks for ${name}. Have you done this in a project, internship, course or job that your CV does not show, and if so what did you do?`
      : `The job asks for ${name}. Have you done this in a job, project, course or volunteering role that your CV does not show, and if so what was it and what did you do?`

  return { requirement: name, summary, question }
}

export const MIN_ANSWER_CHARS = 40
export const MIN_ANSWER_WORDS = 8
export const MAX_ANSWER_CHARS = 1500

export type AnswerValidation = { ok: true; answer: string } | { ok: false; message: string }

/**
 * Cleans and bounds the candidate's answer before it goes anywhere near a
 * model. Control characters and the section marker used by
 * buildFollowUpCvText are removed so an answer cannot close the labelled
 * section early and pass off its own text as CV content.
 *
 * A one line reply cannot contain evidence, so it is refused here, before
 * any API call is made and before the candidate's one opportunity is used.
 * The frontend applies the same rule so the message appears without a
 * round trip; this is the authoritative copy.
 */
export function validateFollowUpAnswer(raw: unknown): AnswerValidation {
  if (typeof raw !== 'string') return { ok: false, message: 'Write a short answer first.' }
  const answer = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/={3,}/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (answer.length > MAX_ANSWER_CHARS) {
    return { ok: false, message: `Keep your answer under ${MAX_ANSWER_CHARS} characters.` }
  }
  const words = answer.split(/\s+/).filter(Boolean).length
  if (answer.length < MIN_ANSWER_CHARS || words < MIN_ANSWER_WORDS) {
    return {
      ok: false,
      message: 'Add a little more detail about what you did, so the recruiter has something specific to assess.',
    }
  }
  return { ok: true, answer }
}

export const CANDIDATE_REPORTED_HEADER = '=== CANDIDATE-REPORTED ADDITIONAL EVIDENCE ==='
export const CANDIDATE_REPORTED_FOOTER = '=== END CANDIDATE-REPORTED ADDITIONAL EVIDENCE ==='

/**
 * The text the second analysis reads in place of the CV: the original CV
 * text, untouched, followed by the candidate's answer in a labelled section.
 * The same string is the grounding source for normalizeAnalysis, so a
 * classification can only cite what the CV or the answer actually says.
 * The follow up addendum in prompt.ts tells the model how to treat the
 * section; the labels here are what it keys on.
 */
export function buildFollowUpCvText(cvText: string, question: string, answer: string): string {
  return [
    cvText,
    '',
    CANDIDATE_REPORTED_HEADER,
    'This section is not part of the CV document. It is the candidate\'s self reported, unverified answer to one follow up question.',
    `Follow up question: ${question}`,
    `Candidate answer: ${answer}`,
    CANDIDATE_REPORTED_FOOTER,
  ].join('\n')
}

/**
 * The "what changed" lines shown with an updated report. They name no score:
 * the report shows one score, and the one it replaced is never shown again.
 * The follow up can only raise the score or leave it unchanged (see
 * applyFollowUpFloor), so there are exactly two cases. Nothing here claims
 * the answer earned the movement beyond what the score itself shows, and
 * nothing implies a score is owed.
 */
export function buildWhatChanged(improved: boolean): string[] {
  return [
    improved
      ? 'Your score was updated after your follow up answer.'
      : "Your score stays the same. Your answer did not materially change the recruiter's assessment.",
    'Your answer is self reported and was not on your CV, so it is weighed with more caution than evidence your CV shows.',
  ]
}
