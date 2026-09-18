#!/usr/bin/env bash
#
# Publish the web build of human-chess to the GitHub Pages site, the same way
# ~/dev/clarinet-doctordle/scripts/deploy-web.sh publishes that game.
#
# Usage:
#   HC_SOURCE_URL=https://github.com/<you>/human-chess npx pnpm@10 deploy
#   HC_SOURCE_URL=... npx pnpm@10 deploy "custom commit message"
#
# The website repo defaults to ~/dev/nkohen.github.io; override with
#   HC_WEBSITE_REPO=/path/to/nkohen.github.io
#
# The app is published to the `human-chess/` subfolder, served at
# https://nkohen.github.io/human-chess/ (Vite base './', hash routing, so no
# server configuration is needed; the Stockfish build is single-threaded, so no
# cross-origin isolation headers either).
#
# HC_SOURCE_URL is required: the app is AGPL-3.0-or-later and ships the GPL-3.0
# Stockfish wasm (memory/reuse-library.md), so a public deployment must offer
# its source. The URL is baked into the home page's colophon (apps/web/src/App.tsx)
# as VITE_SOURCE_URL. Refusing to publish without it is deliberate.
#
# Fails fast: a failed typecheck/test/build aborts before anything is copied.
# Replaces the subfolder wholesale (rsync --delete) so stale hashed assets never
# linger, stages ONLY that subfolder, and no-ops when the output is unchanged.

set -euo pipefail

APP_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEBSITE_REPO="${HC_WEBSITE_REPO:-$HOME/dev/nkohen.github.io}"
SUBDIR="human-chess"
URL="https://nkohen.github.io/${SUBDIR}/"
MSG="${1:-Update human-chess ($(date +%Y-%m-%d\ %H:%M))}"

if [ -z "${HC_SOURCE_URL:-}" ]; then
  echo "✗ HC_SOURCE_URL is not set." >&2
  echo "  The published site must offer its source (AGPL-3.0; GPL-3.0 Stockfish wasm)." >&2
  echo "  Push this repository somewhere public and run:" >&2
  echo "    HC_SOURCE_URL=https://github.com/<you>/human-chess npx pnpm@10 deploy" >&2
  exit 1
fi

if [ ! -d "$WEBSITE_REPO/.git" ]; then
  echo "✗ Website repo not found at: $WEBSITE_REPO" >&2
  echo "  Set HC_WEBSITE_REPO to its path." >&2
  exit 1
fi

cd "$APP_REPO"

# The source offer must describe the build that is actually published: refuse a dirty tree,
# and, once a remote exists, an unpushed HEAD. The colophon links the exact revision.
# observe/ and .almanac/ are hook-written telemetry, dirty in every session; they ship nothing.
if git status --porcelain -- . ':!observe' ':!.almanac' | grep -q .; then
  echo "✗ Uncommitted changes in $APP_REPO; the published build must match a committed revision." >&2
  exit 1
fi
if git remote | grep -q . && ! git branch -r --contains HEAD | grep -q .; then
  echo "✗ HEAD is not on any remote branch; push first so the source offer at $HC_SOURCE_URL is real." >&2
  exit 1
fi
SOURCE_REV="$(git rev-parse --short HEAD)"

echo "▶ Typecheck + tests…"
npx pnpm@10 check

echo "▶ Building (VITE_SOURCE_URL=$HC_SOURCE_URL, VITE_SOURCE_REV=$SOURCE_REV)…"
VITE_SOURCE_URL="$HC_SOURCE_URL" VITE_SOURCE_REV="$SOURCE_REV" npx pnpm@10 build

DEST="$WEBSITE_REPO/$SUBDIR"
echo "▶ Copying build → $DEST"
mkdir -p "$DEST"
# Wholesale replace of the published subfolder (never anything else in the repo).
rsync -a --delete "$APP_REPO/apps/web/dist/" "$DEST/"

cd "$WEBSITE_REPO"
# Only this subfolder is ever committed; anything the user had staged stays out of the commit.
if ! git diff --cached --quiet; then
  echo "✗ $WEBSITE_REPO has staged changes; commit or unstage them before deploying." >&2
  exit 1
fi
git add "$SUBDIR"
if git diff --cached --quiet -- "$SUBDIR"; then
  echo "✔ No changes to publish — the live build is already up to date."
  exit 0
fi

echo "▶ Committing: $MSG"
git commit -q -m "$MSG" -- "$SUBDIR"
echo "▶ Pushing…"
git push
echo
echo "✅ Published. Live (after GitHub Pages rebuilds, ~30-60s) at:"
echo "   $URL"
