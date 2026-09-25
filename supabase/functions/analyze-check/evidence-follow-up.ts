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
 * Ranking: critical gaps first, then the largest potential score gain (the
 * score's own importance weight times the credit still missing, supplied by
 * the caller so this module never holds a second copy of the weights), then
 * the order the model listed them.
 */
export function selectEvidenceGap(
  requirements: RawRequirement[],
  potentialGain: (requirement: RawRequirement) => number,
  clean: (text: string) => string = (text) => text,
): EvidenceGap | null {
  const candidates = requirements
    .map((requirement, index) => ({ requirement, index, gain: potentialGain(requirement) }))
    .filter(
      ({ requirement }) =>
        requirement.match_strength !== 'strong' &&
        requirement.importance !== 'nice_to_have' &&
        displayName(requirement.requirement, clean).length > 0,
    )
    .sort(
      (a, b) =>
        Number(b.requirement.critical) - Number(a.requirement.critical) || b.gain - a.gain || a.index - b.index,
    )

  const top = candidates[0]?.requirement
  if (!top) return null

  const name = displayName(top.requirement, clean)
  const summary = top.match_strength === 'partial' ? `Some evidence for ${name}, not enough.` : `No evidence for ${name} yet.`
  // The report shows the requirement above the question and the reassessment
  // receives it separately, so the question names neither it nor the gap.
  const question =
    top.category === 'skills'
      ? 'Have you used this in a job, project, internship or course that your CV does not currently show?'
      : 'Have you done this in a job, project, course or volunteering role that your CV does not currently show?'

  return { requirement: name, summary, question }
}

export const MIN_ANSWER_CHARS = 40
export const MIN_ANSWER_WORDS = 8
export const MAX_ANSWER_CHARS = 1500

export type AnswerValidation = { ok: true; answer: string } | { ok: false; message: string }

// The example the follow up card shows above the answer box (mirrored in
// src/lib/evidenceFollowUp.ts, kept equal by a test). It is guidance, never
// evidence: it is not sent anywhere, and an answer that copies it is refused
// here, so its invented figures cannot reach a reassessment or a document.
export const FOLLOW_UP_EXAMPLE =
  'Users were dropping off during onboarding. I simplified the signup process, increasing completion from 62% to 78%.'
export const FOLLOW_UP_EXAMPLE_COPY_MESSAGE = 'That is our example. Describe your own experience in your own words.'

const EXAMPLE_STOPWORDS = new Set(['were', 'from', 'during', 'with', 'that', 'this', 'have', 'into', 'over', 'they', 'their', 'then', 'than'])
const EXAMPLE_COPY_SHARE = 0.7

function exampleTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => /^\d+$/.test(token) || (token.length >= 4 && !EXAMPLE_STOPWORDS.has(token))),
  )
}

/** True when an answer holds most of the example's distinctive words and figures. */
export function copiesFollowUpExample(answer: string): boolean {
  const example = [...exampleTokens(FOLLOW_UP_EXAMPLE)]
  const tokens = exampleTokens(answer)
  return example.filter((token) => tokens.has(token)).length / example.length >= EXAMPLE_COPY_SHARE
}

/**
 * Cleans and bounds the candidate's answer before it goes anywhere near a
 * model. Control characters and the section marker used by
 * buildFollowUpCvText are removed so an answer cannot close the labelled
 * section early and pass off its own text as CV content.
 *
 * A one line reply cannot contain evidence, and a copy of the example is not
 * the candidate's evidence, so both are refused here, before any API call is
 * made and before the candidate's one opportunity is used.
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
  if (copiesFollowUpExample(answer)) return { ok: false, message: FOLLOW_UP_EXAMPLE_COPY_MESSAGE }
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
export function buildFollowUpCvText(cvText: string, requirement: string, question: string, answer: string): string {
  // The requirement comes from the job description the candidate pasted, so it cannot close the section either.
  const withoutMarkers = (text: string) => text.replace(/={3,}/g, ' ')
  return [
    cvText,
    '',
    CANDIDATE_REPORTED_HEADER,
    'This section is not part of the CV document. It is the candidate\'s self reported, unverified answer to one follow up question.',
    `Requirement: ${withoutMarkers(requirement)}`,
    `Follow up question: ${withoutMarkers(question)}`,
    `Candidate answer: ${answer}`,
    CANDIDATE_REPORTED_FOOTER,
  ].join('\n')
}

/**
 * The "what changed" lines shown with an updated report. They name no score:
 * the report shows one score, and the one it replaced is never shown again.
 * The follow up can only raise the score or leave it unchanged (see
 * applyFollowUpScoreLimits), so there are exactly two cases. Nothing here claims
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
