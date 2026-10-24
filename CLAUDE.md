# Agent rules — karatsu-fishing-hackathon

Read at startup: [docs/pm-contract.md](docs/pm-contract.md), [docs/planner-contract.md](docs/planner-contract.md), [docs/backlog.md](docs/backlog.md), [docs/how-the-system-works.md](docs/how-the-system-works.md), [docs/staging-worker.md](docs/staging-worker.md), [docs/review.md](docs/review.md), [docs/implementation-decisions.md](docs/implementation-decisions.md).

## Stack

Static demo: root `index.html` (inline CSS/JS, no libraries), `sample_data.json`, `verify_sample_data.js`. Node 22 for verification and review tools only. **Public repository** — never commit API keys or secrets.

## Work

Branch from `origin/main`; never commit on `main`. One commit per change with the tool's `Co-authored-by` line. Before a push that touches the demo or sample data: `node verify_sample_data.js`. Open locally: `python3 -m http.server 8765` → `http://localhost:8765/`.

## Merging

Merge only on an explicit PM order naming the PR, items, and exact head SHA. Code PRs: green `gh pr checks`, one Perplexity review of the final head posted on the PR (run asynchronously; it does not block shipping during the hackathon pitch). Docs-only PRs (only `docs/`, `skills/`, or `*.md`): no review required; PM orders merge when the fleet ends.

Merge command shape: `gh pr checks <N>` (all green), then `gh pr merge <N> --squash --match-head-commit <sha> --delete-branch` unless the PM order says otherwise.

## Review

Perplexity first via `tools/pplx-review.mjs`. Submission is exactly `code review <GitHub PR URL>`. Model: Gemini 3.8 Flash. Details: [docs/review.md](docs/review.md). RT 2026-10-23: code reviews run asynchronously and do not block the demo.

## Staging and production

Vercel hosts the static site. Staging URL (production deployment of `main`): see [docs/staging-worker.md](docs/staging-worker.md). Each PR gets a Vercel preview URL on the PR conversation.

## PM handover

[skills/pm-handover/SKILL.md](skills/pm-handover/SKILL.md); package with `skills/pm-handover/scripts/pack.sh` into ignored `uploads/`.
