# Synthetic fixtures

Every candidate, employer, university, project and job description in this
directory is **invented**. Nothing here is copied from, derived from, or
adapted from a real CV, a real check row, a real user, or any production
record. Names are drawn from obviously fictional combinations, employers are
made-up company names, and contact details are omitted entirely rather than
faked, so no fixture can collide with a real address.

This is the only candidate-shaped data that automated work in this repo is
allowed to read. See the data classification table in `CLAUDE.md`: fixtures
are SAFE TEST DATA, real checks and uploads are SENSITIVE and never leave the
hosted project.

## What these exercise

`supabase/functions/analyze-check/logic.ts` splits scoring into two halves:

1. A model classifies a CV against a job description, producing evidence
   levels and a requirement match matrix.
2. Deterministic functions turn those classifications into a score.

These fixtures supply the output of step 1 by hand, so step 2 can be tested
with no model call, no network, and no API key. The expected scores are
hand-derived from the documented weights, not captured from a run, so a
change to the formula fails the test rather than silently rewriting the
baseline.

## Adding a fixture

Add a case to `candidates.ts` with a fictional CV and job description, the
analysis a recruiter would plausibly produce, and the score you expect from
the published weights. If your hand-computed score disagrees with the code,
work out which one is wrong before changing either.
