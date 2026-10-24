# Review — karatsu-fishing-hackathon

Repackaged from naval-association-calgary on 2026-10-24. One independent Perplexity review per **code** PR (touches `index.html`, `sample_data.json`, `verify_sample_data.js`, or `tools/`). Docs-only PRs: no review.

RT 2026-10-23: reviews run **asynchronously** during the hackathon; they inform fixes but do not block the pitch demo.

## Checks

- **GitHub Actions:** workflow `PR Check` runs `node verify_sample_data.js` when demo files change.
- **Vercel:** deployment status on the PR (preview + production on `main`).

## PPLX

- Tool: `tools/pplx-review.mjs` (canonical copy in this repo).
- Submission: exactly `code review <GitHub PR URL>` — nothing else.
- Model: Gemini 3.8 Flash on Perplexity.
- Post capture as PR comment; first line `Reviewer: Gemini 3.8 Flash via Perplexity (PPLX); version reviewed: <sha>; posted by: …`
- Triage with last line `Real findings: <n>`.

Runbook (OCI box): see naval-association-calgary `docs/review.md` § Running PPLX; use profile copy under `/home/opc/.mozilla/firefox/w6ycu9xj.default-default`, 120 s budget.
