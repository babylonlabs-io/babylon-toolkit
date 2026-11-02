import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { RECORDED_ENDPOINTS } from "./e2e/fixtures/replay/contracts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT_MISSING_ENV = 5173;
const PORT_FULL_ENV = 5175;
/**
 * Full mock env plus the dev-only god-mode panel. Its own server because the
 * panel mounts a fixed launcher on every screen, which the behavioural specs
 * on `PORT_FULL_ENV` must not have to click around.
 * The layout and liquidation tour specs use this panel.
 */
const PORT_GOD_MODE = 5176;
const GOD_MODE_SPECS = [
  "**/artifact-download-cancel.spec.ts",
  "**/deposit-progress-layout.spec.ts",
  "**/liquidation-tour.spec.ts",
];
/**
 * Specs that also run on the phone profiles, on top of the desktop project.
 * Pixel 7 is a Chromium descriptor; an iPhone one would switch to WebKit,
 * which CI does not install.
 */
const PHONE_SPECS = ["**/eth-first-access.spec.ts", "**/phone-session.spec.ts"];
/** Specs that run only on the phone projects. */
const PHONE_ONLY_SPECS = ["**/phone-journey.spec.ts"];
/**
 * Demo pacing for the chromium project, off unless set. CI sets neither.
 * `slowMo` delays input actions and navigation only, not network routing.
 */
const DEMO_SLOW_MO_MS =
  Number.parseInt(process.env.E2E_SLOW_MO_MS ?? "", 10) || 0;
const DEMO_VIDEO = process.env.E2E_VIDEO === "on" ? "on" : "off";
/**
 * A project-level `testIgnore` replaces the top-level one rather than adding
 * to it, so the visual exclusion documented on `testIgnore` below has to be
 * repeated wherever a project narrows its own file set.
 */
const BEHAVIOURAL_TEST_IGNORE = ["**/visual/**", ...GOD_MODE_SPECS];

/**
 * Mock backend the e2e suite pins so no spec reaches a live host. The
 * contracts and endpoints come from networks/e2e-replay.json; this object
 * holds only what is not a profile field. Exported because
 * `playwright.visual.config.ts` spreads it.
 */
export const MOCK_ENV_VARS = {
  NEXT_PUBLIC_TBV_NETWORK: "e2e-replay",
  // Pinned so a developer's .env override cannot send reads to a live RPC.
  NEXT_PUBLIC_ETH_RPC_URL: RECORDED_ENDPOINTS.ETH_RPC_URL,
  // Pinned mempool base so route handlers in
  // `services/vault/e2e/fixtures/networkRoutes.ts` can match
  // deterministic paths.
  NEXT_PUBLIC_MEMPOOL_API: "http://localhost:9996/mempool",
  NEXT_PUBLIC_REOWN_PROJECT_ID: "test-project-id-12345",
  NEXT_PUBLIC_SENTRY_DSN: "https://test@o12345.ingest.sentry.io/12345",
  // Route events through a tunnel so SentryInterceptor (which intercepts **/sentry-tunnel)
  // captures them. The DSN alone enables Sentry; this only changes where events are POSTed.
  NEXT_PUBLIC_SENTRY_TUNNEL_URL: "http://localhost:8092/sentry-tunnel",
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: "e2e-test",
  // Gate that the page-side `getInjectedWallets()` helper reads to
  // decide whether to surface `window.__BABYLON_E2E_WALLETS__`.
  NEXT_PUBLIC_E2E_MODE: "1",
};

/** A profile name no file matches: the dev server boots and the app shows its configuration modal. */
const MISSING_PROFILE_NAME = "missing-profile-for-e2e";

export default defineConfig({
  testDir: path.join(__dirname, "e2e"),
  // Match only Playwright specs. The fixtures themselves have
  // colocated vitest unit tests under `e2e/fixtures/__tests__/`; those
  // are run by vitest (`pnpm test`), not Playwright. Loading them here
  // double-instantiates @vitest/expect alongside @playwright/test's
  // expect and crashes discovery with a `Symbol($$jest-matchers-object)`
  // collision.
  testMatch: "**/*.spec.ts",
  // The visual captures are a separate surface with their own config
  // (`playwright.visual.config.ts`): different port, forced feature flags,
  // reducedMotion, no retries. Without this they also match `testMatch`
  // above and run inside the behavioural suite, where `waitForVisualStability`
  // chases live animations for its full timeout and then retries twice.
  testIgnore: "**/visual/**",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 2,
  timeout: 90_000,
  workers: 1,
  reporter: "html",

  use: {
    headless: true,
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      testIgnore: [...BEHAVIOURAL_TEST_IGNORE, ...PHONE_ONLY_SPECS],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${PORT_FULL_ENV}`,
        launchOptions: { slowMo: DEMO_SLOW_MO_MS },
        video: DEMO_VIDEO,
      },
    },
    {
      name: "chromium-god-mode",
      testMatch: GOD_MODE_SPECS,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${PORT_GOD_MODE}`,
      },
    },
    {
      name: "chromium-phone-360",
      testMatch: [...PHONE_SPECS, ...PHONE_ONLY_SPECS],
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 360, height: 780 },
        baseURL: `http://localhost:${PORT_FULL_ENV}`,
      },
    },
    {
      name: "chromium-phone-390",
      testMatch: [...PHONE_SPECS, ...PHONE_ONLY_SPECS],
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
        baseURL: `http://localhost:${PORT_FULL_ENV}`,
      },
    },
  ],

  webServer: [
    {
      command: `pnpm exec vite --port ${PORT_MISSING_ENV} --strictPort`,
      url: `http://localhost:${PORT_MISSING_ENV}`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      // Disable Sentry on the server with missing configuration.
      env: {
        NEXT_PUBLIC_TBV_NETWORK: MISSING_PROFILE_NAME,
        NEXT_PUBLIC_SENTRY_DSN: "",
        PLAYWRIGHT_VITE_CACHE_DIR: "node_modules/.vite-e2e-missing",
      },
    },
    {
      command: `pnpm exec vite --port ${PORT_FULL_ENV} --strictPort`,
      url: `http://localhost:${PORT_FULL_ENV}`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...MOCK_ENV_VARS,
        // Explicit, because process env wins over a developer's `.env.local`.
        NEXT_PUBLIC_FF_GOD_MODE_PANEL: "false",
        PLAYWRIGHT_VITE_CACHE_DIR: "node_modules/.vite-e2e-full",
      },
    },
    {
      command: `pnpm exec vite --port ${PORT_GOD_MODE} --strictPort`,
      url: `http://localhost:${PORT_GOD_MODE}`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...MOCK_ENV_VARS,
        NEXT_PUBLIC_FF_GOD_MODE_PANEL: "true",
        NEXT_PUBLIC_FF_POSITION_DEBUG_PANEL: "true",
        PLAYWRIGHT_VITE_CACHE_DIR: "node_modules/.vite-e2e-god-mode",
      },
    },
  ],
});
