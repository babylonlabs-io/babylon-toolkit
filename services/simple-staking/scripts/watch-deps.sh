#!/usr/bin/env bash
set -euo pipefail

SERVICE=${1:?Usage: $0 <projectName>}

echo "Watch dependencies for $SERVICE"
pnpm exec nx watch \
  --projects="$SERVICE" \
  --includeDependentProjects \
  -- '[ "$NX_PROJECT_NAME" = "'"$SERVICE"'" ] || nx run "$NX_PROJECT_NAME:build"'