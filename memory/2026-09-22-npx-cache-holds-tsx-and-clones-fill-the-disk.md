Date
2026-09-22

Incorrect assumption or mistake
That freeing disk space on the development machine is a matter of deleting
branches and repositories. On 2026-09-22 the machine ran out of space mid
task: a command failed with ENOSPC before it could write its own output, and
`/Users/Other/Projects/RecruiterCheck` was gone in the next session, which had
to clone again. The space was not in git. Four copies of this repository
existed at once, each with its own `node_modules`, and `~/.npm` had grown to
5.5 GB.

Why it was wrong
The entire history of this repository is about 11 MB, and a branch is a single
file holding a commit id, so deleting branches reclaims nothing. The cost is
`node_modules` (about 670 MB per copy: 182 MB at the root, 485 MB under
`admin/`), build output (`admin/.next` about 170 MB), and the npm cache.

Verified correct rule
Keep one clone and use `git worktree` for parallel work, since worktrees share
the one history instead of copying it (about 8 MB each here, against roughly
900 MB for a clone with its dependencies installed). To reclaim space:
`npm cache clean --force` on `~/.npm/_cacache`, delete `admin/.next` and
`dist`, and remove `~/Library/Caches/*.ShipIt`. All are re-created on demand.

Never delete `~/.npm/_npx`. `tsx` is not a declared dependency of this repo
(see CLAUDE.md, "Commands"), and every test file runs through `npx tsx`, so
that directory is where the test runner's `tsx` actually lives. Clearing it
means the next test run re-resolves `tsx` unpinned from the network, and
fails outright without one.

How to prevent recurrence
Before installing dependencies into another copy of this repo, check whether a
worktree would do. When space is short, measure before deleting:
`du -sh ~/.npm ~/Library/Caches/* ; du -sh */node_modules`. Check a
directory for uncommitted and unpushed work before removing it, and never
remove another session's clone or worktree; ask that session to clean up its
own.

Affected files or systems
`~/.npm/_cacache` and `~/.npm/_npx`, `node_modules` and `admin/node_modules`,
`admin/.next`, `dist`, `.claude/worktrees/`, `scripts/run-tests.mjs` and every
`// Run with: npx tsx <path>` test header.

Source used for verification
Measured on this machine on 2026-09-22: `.git` 11 MB, root `node_modules`
182 MB, `admin/node_modules` 485 MB, `admin/.next` 169 MB, `~/.npm` 5.5 GB
before and 1.8 GB after `npm cache clean --force`, of which 1.8 GB is `_npx`.
Free space went from 3.6 GB to 8.2 GB after clearing the npm cache, the
ShipIt caches and `admin/.next`. `npm run typecheck` and `npx tsx --version`
both still worked afterwards, confirming the cache clear broke nothing.
