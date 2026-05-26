#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

clock_index="R1-7Segment-Clock/index.html"

update_clock_app_version() {
  if [[ ! -f "$clock_index" ]]; then
    echo "Clock index file not found: $clock_index" >&2
    exit 1
  fi

  local version
  version="$(git rev-parse --short HEAD)"

  local current
  current="$(grep -Eo 'window\.APP_VERSION = "[^"]+";' "$clock_index" | head -n1 | sed -E 's/window\.APP_VERSION = "([^"]+)";/\1/')"

  if [[ "$current" == "$version" ]]; then
    return
  fi

  sed -E -i.bak "s/window\.APP_VERSION = \"[^\"]+\";/window.APP_VERSION = \"$version\";/" "$clock_index"
  rm -f "$clock_index.bak"

  git add "$clock_index"
  git commit -m "Clock: auto-bump APP_VERSION to $version"
}

branch="$(git branch --show-current)"
if [[ -z "$branch" ]]; then
  echo "Unable to determine the current branch." >&2
  exit 1
fi

if [[ -n "$(git status --short)" ]]; then
  echo "Working tree is dirty. Commit or stash changes before publishing." >&2
  exit 1
fi

update_clock_app_version

echo "Publishing $branch to origin and pages..."
git push origin "$branch"
git push --force-with-lease pages HEAD:main

echo "GitHub Pages status:"
gh api repos/electricbears/R1-Creations-pages/pages --jq '.status + "|" + .html_url'
