#!/usr/bin/env bash
# update-skill.sh — one-command updater for an open-ultrawork checkout.
#
# Usage (human or AI agent):
#   bash scripts/update-skill.sh
#
# What it does: git pull --ff-only, then run quota-free self-checks.
# Exit 0 = updated and self-checks green; non-zero = stop and read the output.
# It never touches auth, config.toml, launchd, or any model session.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "not a git checkout; re-clone instead:" >&2
  echo "  git clone https://github.com/JNSlayer2/open-ultrawork" >&2
  exit 2
fi

before="$(git rev-parse --short HEAD)"
git fetch --quiet origin
git pull --ff-only
after="$(git rev-parse --short HEAD)"

# Self-checks: syntax + orchestrator selftest (no model quota spent).
node --check scripts/ultrawork.mjs
node --check scripts/flow-levels.mjs 2>/dev/null || true # absent on old checkouts
node scripts/ultrawork.selftest.mjs

if [ "$before" = "$after" ]; then
  echo "open-ultrawork already up to date ($after) — selftest ok"
else
  echo "open-ultrawork updated $before -> $after — selftest ok"
fi
