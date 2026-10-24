# How the system works

1. **Demo** — Fisher voice memo → browser page calls Claude (or fallback sample JSON) → JA/EN sponsor report and running totals.
2. **Data** — Team sample memos live in `sample_data.json`, embedded in `index.html` via the build script or inline JSON block.
3. **Ship** — Feature branches → pull request → Vercel preview → optional Perplexity review (async) → PM merge order → production URL on Vercel.
4. **Governance** — PM and planner contracts, backlog, and decisions in `docs/`; agents read [CLAUDE.md](../CLAUDE.md) at startup.
