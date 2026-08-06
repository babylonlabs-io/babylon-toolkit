import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MOCK_ENV_VARS } from "./playwright.config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Visual capture config - deliberately separate from `playwright.config.ts`.
 *
 * The e2e config asserts *behaviour* and is free to retry, run against a
 * partially-mocked backend, and vary. This config only photographs
 * screens, so every knob here is set for reproducibility instead:
 * one worker, no retries, fixed viewport scale, reduced motion.
 *
 * It captures against the **dev server**, not a production build. That
 * is a cost decision and it is safe here: the computed-baseline model
 * compares dev-render against dev-render, so any dev-only artifact
 * appears identically on both sides and cancels out. Skipping
 * `tsc --noEmit && vite build` on both sides is what makes it viable to
 * run this on every PR.
 */

const VISUAL_PORT = 5177;

/**
 * Where captured PNGs land. CI sets this per side (baseline vs candidate).
 * Exported so `e2e/visual/routes.visual.spec.ts` imports it rather than
 * recomputing the same default.
 */
export const VISUAL_OUTPUT_DIR =
  process.env.VISUAL_OUT_DIR ?? path.join(__dirname, "e2e/visual/__captures__");

/**
 * The e2e config's mock backend, so no screen reaches a live host, plus the
 * capture-only overrides. Spread rather than copied: a hand-maintained second
 * copy would drift silently, and the capture would still pass — against a
 * different app than the e2e suite tests.
 *
 * Feature flags are forced ON because the v3 shell and its sections are the
 * surface worth protecting, and a flag that flipped between the two sides
 * would read as a visual regression.
 */
const VISUAL_ENV_VARS = {
  ...MOCK_ENV_VARS,
  // Sentry off: a capture run must not transmit anything. The e2e suite
  // needs the opposite (it asserts on tunnelled events).
  NEXT_PUBLIC_SENTRY_DSN: "",
  NEXT_PUBLIC_SENTRY_TUNNEL_URL: "",
  NEXT_PUBLIC_FF_ENABLE_V3_UI: "true",
  NEXT_PUBLIC_FF_ENABLE_EXPLORE: "true",
  NEXT_PUBLIC_FF_LIQUIDATION_ANALYSIS_CHART: "true",
  // Dev-only panel; would overlay every screen it mounts on.
  NEXT_PUBLIC_FF_GOD_MODE_PANEL: "false",
};

export default defineConfig({
  testDir: path.join(__dirname, "e2e/visual"),
  testMatch: "**/*.visual.spec.ts",
  // Captures must not race each other for the shared dev server, and a
  // retry would silently paper over a genuinely unstable screen.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: false,
  timeout: 120_000,
  reporter: "list",
  outputDir: path.join(__dirname, "e2e/visual/.playwright-output"),

  use: {
    headless: true,
    baseURL: `http://localhost:${VISUAL_PORT}`,
    // Triggers core-ui's global animation/transition reset. MUST sit under
    // `contextOptions`: `reducedMotion` is not a top-level `use` option, so
    // Playwright silently ignores it there and every route was being
    // photographed with animations still running — which is also what left
    // `waitForVisualStability` chasing motion for its full timeout.
    contextOptions: { reducedMotion: "reduce" },
    // Pin both: the OS/browser default would otherwise decide, and the
    // app themes off `prefers-color-scheme`.
    colorScheme: "light",
    // A scale factor of 2 would quadruple PNG bytes for no extra signal.
    deviceScaleFactor: 1,
    trace: "off",
    video: "off",
  },

  projects: [
    {
      name: "visual",
      use: { ...devices["Desktop Chrome"], deviceScaleFactor: 1 },
    },
  ],

  webServer: {
    command: `pnpm exec vite --port ${VISUAL_PORT} --strictPort`,
    url: `http://localhost:${VISUAL_PORT}`,
    timeout: 120_000,
    // MUST be false in CI. The workflow captures twice in one job - once
    // at the PR head, once at the merge-base. If the second run reused
    // the first run's still-listening dev server it would photograph the
    // *same* code twice, the diff would always be empty, and the check
    // would silently pass forever. Locally, reuse is just a convenience.
    reuseExistingServer: !process.env.CI,
    env: { ...VISUAL_ENV_VARS },
  },
});
