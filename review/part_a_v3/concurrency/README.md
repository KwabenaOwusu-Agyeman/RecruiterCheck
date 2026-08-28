# Two-session concurrency tests

Run against the disposable local database (`part_a_validation`, already created and migrated during this review — see `V4_SUMMARY.md`) or, once approved, against the test project via two separate `psql`/SQL-editor connections.

## Procedure

1. Open **Session A**: `psql -d part_a_validation`
2. Open **Session B**: `psql -d part_a_validation` (second terminal/connection)
3. Run `session_a.sql`'s statements **up to the marked PAUSE point** in Session A.
4. Run all of `session_b.sql` in Session B — it should either block (waiting on Session A's held lock) or observe Session A's uncommitted state correctly, per each scenario's comment.
5. Resume Session A past the PAUSE point (commit/rollback as directed).
6. Confirm Session B then proceeds/completes as expected.
7. Run `verification.sql` in either session afterward to check final state.

## Scenarios covered and expected results

| Scenario | Session A | Session B | Expected |
|---|---|---|---|
| Reservation vs. expiry, same user | Holds `reserve_keyword_scan`'s profile lock mid-transaction | Calls `expire_credit_batches()` | B blocks until A commits/rolls back; no deadlock (`40P01`) |
| Reservation vs. refund reserve, same batch | Holds `reserve_keyword_scan`'s batch lock | Calls `reserve_refund` on the same batch | B blocks, then correctly sees A's committed decrement (or sees the pre-A state if A rolled back) |
| Concurrent reserve, final free credit | Two sessions both call `reserve_keyword_scan` with different idempotency keys when only 1 free credit remains | — | Exactly one gets `'reserved'`, the other gets `'no_credits'` — never both reserved |
| Reconciler vs. complete, same reservation | A holds the reservation row lock (simulating `complete_keyword_scan` mid-flight) | B calls `reconcile_abandoned_keyword_scan_reservations()` after backdating the lease | B's `for update skip locked` skips A's locked row this cycle; A's subsequent `complete_keyword_scan` succeeds normally; the row is never double-processed |
| Stale webhook-worker fencing | A claims an event, gets a token, does NOT complete | B backdates the lease, reclaims (gets a new token) | A's later `complete_stripe_webhook_event` with its OLD token returns `stale_claim`, never overwrites B's outcome |

## Notes

- `for update skip locked` in the reconciler/expiry functions means a session that finds a row already locked simply skips it for that pass rather than blocking — this is intentional (Item B/14), verified by the "Reconciler vs. complete" scenario above.
- Every other lock acquisition in this design (profile, batch under normal `for update`) is a genuine blocking wait, verified by the first two scenarios.
