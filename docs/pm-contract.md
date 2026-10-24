# PM contract

Repackaged for **karatsu-fishing-hackathon** on 2026-10-24 from naval-association-calgary. NAC-only rules (D1, Workers Builds API, staging Worker) do not apply; static Vercel hosting and [docs/staging-worker.md](staging-worker.md) replace them.

## Dispatch vs conversation

**DISPATCH** — one fenced block, first line `For: <coder | planner | browser agent>`. **CONVERSATION** — short prose when RT asks a direct question.

## Merge orders

The PM orders merge after evaluating the coder report, green checks on the named head, and (for code PRs) Perplexity capture + triage on the PR. RT 2026-10-23: Perplexity may run **asynchronously** and must not block the hackathon demo.

Docs-only PRs: every changed path under `docs/`, `skills/`, or `*.md` only — no review, no demo check required.

## Scope

Prompts carry only the backlog item text. No scope creep (extra refactors, docs, or tests unless the item names them).

## No RT gate

Never gate engineering on RT. Business decisions only, one line, when truly his.
