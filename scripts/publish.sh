#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
branch=$(git rev-parse --abbrev-ref HEAD)
[ "$branch" = "staging" ] || { echo "Switch to staging (git checkout staging)"; exit 1; }
git push origin staging
if ! gh pr view --base main >/dev/null 2>&1; then
  gh pr create --base main --title "Publish: $(date +%F)" --body "Auto-publish from script."
fi
gh pr merge --merge --delete-branch
gh workflow run "Deploy to Neocities (manual)" --ref main
echo "✅ Merge complete and deploy triggered. Check GitHub → Actions."
