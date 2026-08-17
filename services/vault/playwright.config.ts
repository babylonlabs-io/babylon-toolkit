import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT_MISSING_ENV = 5173;
const PORT_FULL_ENV = 5175;

/**
 * Mock backend the e2e suite pins so no spec reaches a live host. Exported
 * because `playwright.visual.config.ts` spreads it: two hand-maintained
 * copies would drift, and the capture would still pass — just against a
 * different app than the one under test.
 */
export const MOCK_ENV_VARS = {
  NEXT_PUBLIC_TBV_BTC_VAULT_REGISTRY:
    "0x0000000000000000000000000000000000000001",
  NEXT_PUBLIC_TBV_AAVE_ADAPTER: "0x0000000000000000000000000000000000000002",
  NEXT_PUBLIC_TBV_AAVE_ADAPTER_CONFIG:
    "0x0000000000000000000000000000000000000003",
  NEXT_PUBLIC_TBV_GRAPHQL_ENDPOINT: "http://localhost:9999/graphql",
  NEXT_PUBLIC_TBV_VP_PROXY_URL: "http://localhost:9998",
  NEXT_PUBLIC_ETH_RPC_URL: "http://localhost:9997/rpc",
  // Both are required by `validateEnvVars` (src/config/env.ts), and their
  // absence here was invisible on a developer machine: vite-plugin-environment
  // reads `.env` files as well as the process env, and `services/vault/.env`
  // supplies them. A clean runner has no `.env`, so validation failed,
  // `envInitError` was set, and the app rendered the blocking "Configuration
  // Error" modal on every screen instead of itself. Anything spawned from this
  // object must therefore stand on its own, without a `.env` behind it.
  // Sepolia + signet is the pairing `configureBabylonConfig` accepts.
  NEXT_PUBLIC_ETH_CHAINID: "11155111",
  NEXT_PUBLIC_BTC_NETWORK: "signet",
  // Pinned mempool base so route handlers in
  // `services/vault/e2e/fixtures/networkRoutes.ts` can match
  // deterministic paths. Without this the dApp falls through to a
  // signet/mainnet default and tests would have to intercept the live
  // hostname.
  NEXT_PUBLIC_MEMPOOL_API: "http://localhost:9996/mempool",
  NEXT_PUBLIC_REOWN_PROJECT_ID: "test-project-id-12345",
  NEXT_PUBLIC_SENTRY_DSN: "https://test@o12345.ingest.sentry.io/12345",
  // Route events through a tunnel so SentryInterceptor (which intercepts **/sentry-tunnel)
  // captures them. The DSN alone enables Sentry; this only changes where events are POSTed.
  NEXT_PUBLIC_SENTRY_TUNNEL_URL: "http://localhost:8092/sentry-tunnel",
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: "e2e-test",
  // Gate that the page-side `getInjectedWallets()` helper reads to
  // decide whether to surface `window.__BABYLON_E2E_WALLETS__`.
  // Vite's EnvironmentPlugin inlines NEXT_PUBLIC_* from process.env at
  // build time, so this must be set when the dev server is spawned.
  NEXT_PUBLIC_E2E_MODE: "1",
};

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
  forbidOnly: false,
  retries: 2,
  timeout: 90_000,
  workers: 1,
  reporter: "html",

  use: {
    headless: true,
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${PORT_FULL_ENV}`,
      },
    },
  ],

  webServer: [
    {
      command: `pnpm exec vite --port ${PORT_MISSING_ENV}`,
      url: `http://localhost:${PORT_MISSING_ENV}`,
      timeout: 120_000,
      reuseExistingServer: true,
      // This "missing configuration" server inherits the parent shell. Force the Sentry DSN
      // empty so a developer's exported NEXT_PUBLIC_SENTRY_DSN can't enable Sentry here and
      // transmit to a real project — the enable gate is DSN-only.
      env: {
        NEXT_PUBLIC_SENTRY_DSN: "",
      },
    },
    {
      command: `pnpm exec vite --port ${PORT_FULL_ENV}`,
      url: `http://localhost:${PORT_FULL_ENV}`,
      timeout: 120_000,
      reuseExistingServer: true,
      env: {
        ...MOCK_ENV_VARS,
      },
    },
  ],
});
