# Staging — Karatsu Fishing Hackathon (Vercel)

This repo is a **static** site (`index.html` at the repository root). There is no Cloudflare Worker or database staging copy.

## URLs (checked 2026-10-24 UTC)

| Role | URL | Notes |
| --- | --- | --- |
| **Staging / production (`main`)** | https://karatsu-fishing-hackathon-aibraincoachs-projects.vercel.app/ | HTTP 200; serves the merged demo |
| **Branch alias (`main`)** | https://karatsu-fishing-hackathon-git-main-aibraincoachs-projects.vercel.app/ | Same deployment family |
| **PR previews** | From the Vercel bot comment on each pull request | Example (PR #1, pre-merge): `https://karatsu-fishing-hackathon-git-fea-<sha>-aibraincoachs-projects.vercel.app` |

Vercel project dashboard: https://vercel.com/aibraincoachs-projects/karatsu-fishing-hackathon

## Deploy behaviour

Pushes that change non-markdown app files trigger a Vercel deployment. Docs-only pushes under `docs/`, `skills/`, or `*.md` do not require a demo redeploy for correctness; the PM still merges document PRs under [CLAUDE.md](../CLAUDE.md).
