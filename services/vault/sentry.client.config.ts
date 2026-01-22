// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/react/

/**
 * Extra notes:
 * This file is manually imported in the main entry point for Vite builds.
 * Source maps are handled by the Sentry Vite plugin during build time.
 * Reference: https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/vite/
 */

import { initSentry } from "@babylonlabs-io/observability";

import { getCommitHash, isProductionEnv } from "@/config";

initSentry({
  getCommitHash,
  isProductionEnv,
});
