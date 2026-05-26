#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

branch="$(git branch --show-current)"
if [[ -z "$branch" ]]; then
  echo "Unable to determine the current branch." >&2
  exit 1
fi

if [[ -n "$(git status --short)" ]]; then
  echo "Working tree is dirty. Commit or stash changes before publishing." >&2
  exit 1
fi

echo "Publishing $branch to origin and pages..."
git push origin "$branch"
git push --force-with-lease pages HEAD:main

echo "GitHub Pages status:"
gh api repos/electricbears/R1-Creations-pages/pages --jq '.status + "|" + .html_url'
