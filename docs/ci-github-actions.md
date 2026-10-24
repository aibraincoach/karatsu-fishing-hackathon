# GitHub Actions (pending token scope)

The workflow file `.github/workflows/pr-check.yml` is ready in the working tree but **cannot be pushed** until the GitHub CLI token includes the `workflow` scope (OAuth apps reject workflow file updates without it).

Enable and push:

```sh
gh auth refresh -h github.com -s workflow
# add .github/workflows/pr-check.yml from this doc's companion commit or regenerate:
# runs: node verify_sample_data.js on pull_request for index.html / sample_data.json
git push origin docs/governance
```

Until then, run `node verify_sample_data.js` locally before opening a code PR; Vercel still deploys previews.
