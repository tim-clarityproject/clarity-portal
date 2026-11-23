#!/bin/bash
# Vercel's ignored build step (vercel.json "ignoreCommand"). Exit 1 builds;
# exit 0 skips the deployment.
#
# Production (main) always builds. A preview builds only when the latest
# commit message contains [preview], so feature-branch pushes don't fill the
# free team's 10 GB of deployment storage (Tim, 23 Nov 2026). One commit marked
# [preview] at the end of each run gives Tim one preview per run (CLAUDE.md).
if [ "$VERCEL_ENV" = "production" ] || [ "$VERCEL_GIT_COMMIT_REF" = "main" ]; then
  echo "Production or main: building."
  exit 1
fi
case "$VERCEL_GIT_COMMIT_MESSAGE" in
  *"[preview]"*) echo "Commit marked [preview]: building the preview."; exit 1 ;;
  *) echo "No [preview] in the commit message: preview skipped."; exit 0 ;;
esac
