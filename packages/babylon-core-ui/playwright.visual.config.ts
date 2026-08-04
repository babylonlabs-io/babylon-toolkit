import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Storybook visual capture.
 *
 * This is the cheapest and broadest visual coverage in the repo: every
 * story renders in isolation with no backend, no wallet and no network,
 * so there is almost nothing left to be non-deterministic. Contrast the
 * vault app capture, which needs a mocked backend to reach even its
 * unconnected state.
 *
 * Captures against a **pre-built static Storybook**, not `storybook dev`.
 * The build is ~11s and the static server has no HMR client injecting
 * itself into the frame, which removes a whole class of jitter.
 */

const VISUAL_PORT = 6007;

/** Where the static Storybook is built to, and served from. */
export const STORYBOOK_STATIC_DIR =
  process.env.STORYBOOK_STATIC_DIR ?? path.join(__dirname, "storybook-static");

export default defineConfig({
  testDir: path.join(__dirname, "visual"),
  testMatch: "**/*.visual.spec.ts",
  fullyParallel: false,
  // Stories are independent, so parallelism is safe here - unlike the
  // vault capture, which shares one dev server. Kept modest so the
  // machine's load does not affect render timing.
  workers: 2,
  retries: 0,
  forbidOnly: false,
  timeout: 120_000,
  reporter: "list",
  outputDir: path.join(__dirname, "visual/.playwright-output"),

  use: {
    headless: true,
    baseURL: `http://localhost:${VISUAL_PORT}`,
    // Triggers the global animation/transition reset in src/index.css.
    reducedMotion: "reduce",
    colorScheme: "light",
    deviceScaleFactor: 1,
    trace: "off",
    video: "off",
  },

  projects: [
    {
      name: "storybook-visual",
      use: { ...devices["Desktop Chrome"], deviceScaleFactor: 1 },
    },
  ],

  webServer: {
    // `vite preview` rather than a new static-server dependency - core-ui
    // already depends on vite, and the repo's policy is to audit every
    // added package.
    command: `pnpm exec vite preview --outDir ${STORYBOOK_STATIC_DIR} --port ${VISUAL_PORT} --strictPort`,
    url: `http://localhost:${VISUAL_PORT}/index.json`,
    timeout: 120_000,
    // Must be false in CI: the workflow captures the merge-base and the
    // PR head in one job, and reusing the first run's server would
    // photograph the same build twice and pass forever.
    reuseExistingServer: !process.env.CI,
  },
});
