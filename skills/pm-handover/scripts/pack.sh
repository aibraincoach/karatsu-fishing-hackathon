#!/usr/bin/env bash
# Package markdown for PM handover. Run from repository root.
set -euo pipefail
command -v zip >/dev/null 2>&1 || { echo "Error: zip is not installed." >&2; exit 1; }
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$ROOT"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then echo "Error: tracked files differ from HEAD; commit or stash, or run from a clean checkout of the revision to pack." >&2; exit 1; fi
SRC=$(git rev-parse HEAD)
echo "Packing revision $SRC"
REPO=karatsu-fishing-hackathon
TS=$(TZ=America/Edmonton date '+%Y-%m-%d_%H-%M-%S_%Z')
UP="$ROOT/uploads"
mkdir -p "$UP"
ZIP="$UP/${REPO}_${TS}_Project-Memory-Handover_Markdown.zip"
rm -f "$ZIP"
git ls-files -z -- '*.md' | xargs -0 zip -q "$ZIP"
if [ -f docs/history/wall-of-stupid.md ]; then
  cp docs/history/wall-of-stupid.md "$UP/${REPO}_${TS}_Wall-of-Stupid.md"
  cp docs/history/wall-of-stupid-archive.md "$UP/${REPO}_${TS}_Wall-of-Stupid-Archive.md"
fi
cp docs/pm-contract.md "$UP/${REPO}_${TS}_PM-Contract.md"
cp docs/planner-contract.md "$UP/${REPO}_${TS}_Planner-Contract.md"
echo "$UP/${REPO}_${TS}_PM-Contract.md"
echo "$UP/${REPO}_${TS}_Planner-Contract.md"
echo "$ZIP"
ls -la "$ZIP"
