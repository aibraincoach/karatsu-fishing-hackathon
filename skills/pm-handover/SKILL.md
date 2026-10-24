---
name: pm-handover
description: Reconcile NAC project documents with fresh GitHub evidence and current session decisions, then package the tracked Markdown and both Walls of Stupid for an incoming PM. Use for PM replacement and handover exports, including local-only exports.
---

# PM handover

The deliverable is a reconciled repository memory and its verified zip, not a zip of stale notes. RT required this reconciliation before packaging on October 16, 2026. The coder performs the reads and edits; the incoming PM receives the package.

## 1. Establish scope and publication mode

Read the user's current instructions and `CLAUDE.md`. Use the fleet's existing document branch/worktree and draft PR; do not put documents on code branches or merge the document PR for a handover. Check for existing edits before changing files and preserve other work.

Distinguish local reconciliation from publishing to GitHub. Honor an explicit local-only/no-push instruction. Otherwise use the session's existing authorization for document pushes; if none exists, complete and commit the local documents and package without pushing, and report that fact. A handover request does not authorize merges, deployments, database writes, review runs, PR comments, or customer contact. Do not alter product code just to make a handover statement true.

## 2. Gather current evidence before writing

- Record the observation time in UTC and America/Edmonton, then `git fetch origin` and read `origin/main`'s SHA. Do not confuse the local checkout or the document branch with main.
- Read GitHub's open PRs and the merged/closed PRs since the preceding handover. For each relevant PR record number, title, branch, exact head, state, draft status, mergeability, and merge SHA/time when applicable. Use fresh `gh pr view` or GET API responses.
- Read checks once per relevant head, without waiting or polling. Label pending/failed/missing checks accurately. A successful PR build is not proof of a production deployment; a merged migration is not proof it was applied to D1.
- Read review captures and triage on the exact heads. Distinguish valid reviews from failed attempts and superseded heads. Record sources for tool limits, models and procedures; do not infer a limit from the number of PRs in a particular run.
- Read the coder's reports, clock records, current user decisions, outstanding prompts and supplied Wall of Stupid entries. Session decisions absent from GitHub still belong in the handover, attributed to their source. If evidence is unavailable, mark it unverified instead of asking RT to fetch facts accessible to the coder.
- Read relevant code at the reported revisions when a document describes behavior. Keep merged code, open-branch implementation, runtime observations and proposed policy distinct.

## 3. Reconcile the repository documents

Inventory all tracked Markdown (`git ls-files -- '*.md'`). Review every current document for statements affected by the evidence, and update all affected files, not just the handover summary. At minimum inspect `CLAUDE.md`, `README.md`, the PM/planner contracts, `docs/review.md`, `docs/backlog.md`, `docs/how-the-system-works.md`, `docs/implementation-decisions.md`, staging/daily-job guidance, and both wall files. List reviewed documents and any unresolved evidence gaps in the handover.

- Put current PR/head/build/review/deployment/migration facts, dependencies, outstanding prompts and next actions in the handover reply, with observation dates and source references; the handover is never a tracked file (docs/decisions.md rows 27 and 53).
- Preserve backlog item numbers, user wording, its four-part format and its Footer rules. Update what remains to be solved; do not dump PR tables, build logs or reports into backlog items. Do not mark unmerged work as delivered or close a partially implemented item.
- Update behavior and setup documents where evidence changed them. Label descriptions of open-branch features and unmerged policy as pending, so the incoming PM cannot mistake them for main or production.
- Update the Wall of Stupid while doing the work. Append supplied entries to `docs/history/wall-of-stupid-archive.md` with the next numeric entry, preserving their text; insert the same heading/date/Rule at the top of its class in `docs/history/wall-of-stupid.md`, retaining existing entries. Supplied entries already recorded are not duplicated. Wall 255 supersedes older incident-account requirements. Preserve attribution and never invent missing incidents or placeholder-number gaps.
- Keep historical records historical. Do not rewrite old reports as though they described today; mark or link superseded guidance where it could be mistaken for the current entrypoint.
- If a new report or user correction arrives before packaging, reconcile its affected documents before the final commit. A stale evidence snapshot must be labeled with its timestamp rather than silently represented as current.

## 4. Commit, then package

Review the complete document diff, run the checks required by the user's instructions and repository, and commit with attribution on the document branch. In publish mode push that branch once for this batch; keep its PR draft and open. In local-only mode leave the commit unpushed and name both local and remote SHAs in the handover report. Do not merge main into the document branch; follow the repository's rebase rule only if synchronization is necessary.

From the clean document checkout run:

```sh
skills/pm-handover/scripts/pack.sh
```

The script writes under `uploads/`: a zip of every tracked `*.md`, plus separate working and archive Wall of Stupid files and separate copies of docs/pm-contract.md and docs/planner-contract.md, each with the same timestamp prefix (item 347). Do not zip the whole checkout or the correspondence directory. Exclude credentials, environment files, browser profiles, live exports, private captures and token-bearing links. Package the reconciled document commit even when the product checkout is older; state that the documentation branch is unmerged and name the observed main SHA.

Verify ZIP CRC, the exact tracked-Markdown entry set, and every entry's SHA-256 against the packaged commit. Verify the separate walls and the two separate contracts byte-for-byte against their zip entries. Provide a manifest outside the zip naming the source commit, observed main SHA, UTC/MDT times, archive hash and per-file hashes. Do not change a packaged document to insert its own commit hash; that would invalidate the snapshot.

Report the document commit and publication status, observation cutoff and unresolved gaps, zip, separate-wall and separate-contract paths, verification result, and important pending work for the new PM. The package is a source-of-truth snapshot with explicit limits, not evidence of a merge, deployment or database change.
