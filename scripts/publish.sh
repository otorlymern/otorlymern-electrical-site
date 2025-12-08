#!/usr/bin/env bash
set -euo pipefail

branch=$(git rev-parse --abbrev-ref HEAD)
[ "$branch" = "main" ] || { echo "Switch to main (git checkout main)"; exit 1; }

echo "Pushing current main branch to origin…"
git push origin main

deploy_flag=${1:-}
case "$deploy_flag" in
  --deploy)
    answer="y"
    ;;
  --skip-deploy)
    answer="n"
    ;;
  *)
    read -r -p "Trigger Neocities deploy workflow now? [y/N] " answer
    ;;
esac

if [[ "$answer" =~ ^[Yy]$ ]]; then
  echo "Triggering GitHub workflow: Deploy to Neocities…"
  gh workflow run "Deploy to Neocities" --ref main
  echo "✅ Deploy request sent. Check GitHub → Actions for status."
else
  echo "Skipping deploy. Run:"
  echo "  gh workflow run \"Deploy to Neocities\" --ref main"
  echo "whenever you’re ready to publish."
fi
