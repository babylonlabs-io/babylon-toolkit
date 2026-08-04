#!/usr/bin/env bash
#
# Captures every visual surface at whatever commit is currently checked out.
#
# Invoked twice per PR by .github/workflows/visual-regression.yml - once at
# the PR head, once at the merge-base - with CAPTURE_ROOT pointing at a
# different directory each time. Both runs happen on the same runner, with
# the same browser build and the same fonts, which is what removes the
# "baseline was generated on a different machine" class of false positive.
#
# CAPTURE_ROOT is required; each surface writes into its own subdirectory so
# the diff step can report them separately.
set -euo pipefail

if [ -z "${CAPTURE_ROOT:-}" ]; then
  echo "CAPTURE_ROOT must be set (the directory this side's captures go into)." >&2
  exit 1
fi

mkdir -p "${CAPTURE_ROOT}/vault" "${CAPTURE_ROOT}/storybook"

# --- Storybook (components) -------------------------------------------------
# The broadest and cheapest surface: every story renders in isolation with no
# backend, no wallet and no network. Built static rather than served by
# `storybook dev` so there is no HMR client injecting itself into the frame.
echo "==> Building static Storybook"
pnpm --filter @babylonlabs-io/core-ui run visual:build

echo "==> Capturing Storybook stories"
VISUAL_OUT_DIR="${CAPTURE_ROOT}/storybook" \
  pnpm --filter @babylonlabs-io/core-ui run visual:capture

# --- Vault app (pages) ------------------------------------------------------
# The vault dev server resolves @babylonlabs-io/core-ui (and ts-sdk,
# wallet-connector) through their package `exports` to `dist/`, which is
# gitignored and therefore ABSENT on a fresh runner. Without this build the
# dev server cannot resolve them and every page captures as a blank frame -
# it only appears to work on a developer machine that has built before.
echo "==> Building workspace packages the vault resolves from dist/"
pnpm exec nx run-many --target=build \
  --projects=@babylonlabs-io/core-ui,@babylonlabs-io/ts-sdk,@babylonlabs-io/wallet-connector

echo "==> Capturing vault routes"
VISUAL_OUT_DIR="${CAPTURE_ROOT}/vault" \
  pnpm --filter @services/vault run visual:capture

echo "==> Capture complete for ${CAPTURE_ROOT}"
ls -1 "${CAPTURE_ROOT}/storybook" | wc -l | xargs echo "    storybook screens:"
ls -1 "${CAPTURE_ROOT}/vault" | wc -l | xargs echo "    vault screens:"
