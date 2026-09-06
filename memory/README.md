# memory/

Durable technical corrections. One file per lesson.

A record is warranted only when a mistake, a wrong assumption, a security lesson
or a product rule correction is likely to recur. Most work produces no record.
A file here that no future session would benefit from reading is noise.

This is not a log, not a changelog and not a place for company decisions,
customer feedback or business context. Those live in Notion HQ.

## Naming

`YYYY-MM-DD-short-slug.md`, for example `2026-09-06-stale-generated-types.md`.

## Format

Each record contains these seven fields, in this order:

```
Date
Incorrect assumption or mistake
Why it was wrong
Verified correct rule
How to prevent recurrence
Affected files or systems
Source used for verification
```

Keep it short. The verification source matters as much as the rule: a rule
recorded without saying how it was established cannot be rechecked later.

## After writing one

`grep` for the same mistake elsewhere in the repository and correct it wherever
it appears, the same day. A record that documents a mistake still present in
three other files has not finished its job.

## Never in these files

Secrets, tokens, API keys, Supabase credentials, CV contents, complete
applications, customer email addresses, payment information or any production
data. Use anonymised identifiers where operational context is necessary.

Long standing engineering lessons that belong to the permanent rules live in
`CLAUDE.md`, not here. This directory holds the corrections; `CLAUDE.md` holds
what those corrections hardened into.
