#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

branch=$(git rev-parse --abbrev-ref HEAD)
[ "$branch" = "staging" ] || { echo "Switch to staging (git checkout staging)"; exit 1; }

# Push latest staging commits
git push origin staging

# Open a PR to main if one doesn't exist
if ! gh pr view --base main >/dev/null 2>&1; then
  gh pr create --base main --title "Publish: $(date +%F)" --body "Auto-publish from script."
fi

# Merge the PR and delete remote branch
gh pr merge --merge --delete-branch

# Trigger the GitHub Action to deploy main to Neocities
gh workflow run "Deploy to Neocities (manual)" --ref main

echo "✅ Published: staging → main merged, deploy triggered. Check GitHub → Actions for status."
