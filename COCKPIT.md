# Cockpit

Current technical status of the MyRecruiterCheck application, the Supabase
backend and the Admin Dashboard. Newest entry first.

This is a status record, not a transcript. It records what is true of the code
and its verification, and nothing about company strategy, marketing, business
metrics, customers or content planning. Those live in Notion HQ. See "Working
memory" in `CLAUDE.md`.

It records what was true when it was written. Before asserting a current fact,
go back to the primary source.

No secrets, tokens, CV contents, applications, email addresses, payment records
or production data appear in this file. Use anonymised identifiers where
operational context is needed.

## Historical review material

`PART_A_KEYWORD_SCAN_REVIEW.md`, `PART_A_KEYWORD_SCAN_CORRECTED_REVIEW.md`,
`PART_A_KEYWORD_SCAN_CORRECTED_REVIEW_V2.md` at the repository root, and the
`review/` directory, are historical review and validation material from earlier
workstreams. They are kept as a record and are not maintained. They are not the
current status record. This file is.

---

## 2026-09-06 — Cockpit and memory system installed

**Objective.** Give Claude Code a small technical memory that survives between
sessions, without duplicating Notion HQ.

**Completed.**
- `CLAUDE.md`: added a source of truth hierarchy, an Admin Dashboard section
  covering purpose, responsibilities and boundaries, the operational Level 3
  actions, an `admin/**` row in the check matrix, and a Working memory section
  carrying the before/during/after protocol and the Notion boundary.
- `COCKPIT.md` created (this file).
- `memory/README.md` created. No records yet.

**Verified.**
- Documentation only. No application code, tooling, configuration or scoring
  logic changed.
- The `admin/**` check matrix row matches the `admin` rule already present in
  `scripts/which-checks.mjs`; it documents existing behaviour rather than adding
  any.
- Push and merge authority is unchanged from what `CLAUDE.md` already documented.

**Blockers.** None.

**Founder action required.** None outstanding.

**Next technical step.** At the end of the next piece of implementation work,
add an entry here using the fields above.

**Commit / PR.** _to fill on commit_
