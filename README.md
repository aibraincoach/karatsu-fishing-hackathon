# Karatsu Fishing Hackathon

**海の森レポート / Sea Forest Report** — hackathon demo for seaweed restoration reporting.

## Demo

- **Live (Vercel, `main`):** https://karatsu-fishing-hackathon-aibraincoachs-projects.vercel.app/
- **Dashboard:** https://vercel.com/aibraincoachs-projects/karatsu-fishing-hackathon

## Agents

Read [CLAUDE.md](CLAUDE.md) at startup. Governance: [docs/](docs/). Sample data: [sample_data.json](sample_data.json). Verify sums: `node verify_sample_data.js`.

## Structure

- `index.html` — single-file demo (Part A)
- `sample_data.json` — team sample memos and fallback results
- `docs/` — PM/planner contracts, backlog, staging URL
- `tools/` — Perplexity review runner (same behaviour as NAC)
- `src/` — reserved for later app code
