import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MOCK_ENV_VARS } from "./playwright.config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Production-bundle config - deliberately separate from `playwright.config.ts`.
 *
 * Every other suite runs against the Vite dev server, which differs from a
 * production build in ways that have shipped broken deposits. For example,
 * vite-plugin-node-polyfills assigns `globalThis.Buffer` only on the dev
 * server; when the bundle lost its other source of that global, the deposit
 * form crashed in deployments while every dev-server suite stayed green. This
 * config builds the app with `vite build` and serves it with `vite preview`,
 * so its specs exercise the bundle a deployment ships.
 *
 * Separate because Playwright starts every `webServer` in a config whatever
 * project runs: a production build in `playwright.config.ts` would add a full
 * build to every local e2e run.
 */

const PROD_PREVIEW_PORT = 5178;

/** Inside `node_modules` so the build never overwrites a developer's `dist/`. */
const PROD_BUILD_DIR = "node_modules/.vite-e2e-prod-dist";

/** A cold `vite build` of the vault takes minutes; the default is one. */
const PROD_BUILD_TIMEOUT_MS = 600_000;

export default defineConfig({
  testDir: path.join(__dirname, "e2e"),
  testMatch: "**/*.prod.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  workers: 1,
  // Own folders, so CI uploads this run's report next to the dev-server
  // suite's instead of overwriting it.
  reporter: [["html", { outputFolder: "playwright-report-prod" }]],
  outputDir: "test-results-prod",

  use: {
    headless: true,
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium-prod",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${PROD_PREVIEW_PORT}`,
      },
    },
  ],

  webServer: {
    command:
      `pnpm exec vite build --outDir ${PROD_BUILD_DIR} && ` +
      `pnpm exec vite preview --outDir ${PROD_BUILD_DIR} --port ${PROD_PREVIEW_PORT} --strictPort`,
    url: `http://localhost:${PROD_PREVIEW_PORT}`,
    timeout: PROD_BUILD_TIMEOUT_MS,
    // Never reuse: unlike a dev server, a preview server already listening on
    // the port serves whatever bundle it was started with, so reusing one
    // would test stale code.
    reuseExistingServer: false,
    env: {
      ...MOCK_ENV_VARS,
      // Keeps a developer's Sentry credentials from turning on the upload
      // plugin, which would create a release from `./dist`, not this bundle.
      DISABLE_SENTRY: "true",
      // Explicit, because process env wins over a developer's `.env.local`.
      // A configured screening API is unreachable behind the sealed network,
      // so screening reports "unavailable" and disables Connect.
      NEXT_PUBLIC_TBV_UTILS_API: "",
      // The heap the vault's own `build` script gives `vite build`; the
      // default runs out.
      NODE_OPTIONS: "--max-old-space-size=8192",
    },
  },
});
