import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT_MISSING_ENV = 5173;
const PORT_FULL_ENV = 5175;

const MOCK_ENV_VARS = {
  NEXT_PUBLIC_TBV_BTC_VAULTS_MANAGER:
    "0x0000000000000000000000000000000000000001",
  NEXT_PUBLIC_TBV_MORPHO_CONTROLLER:
    "0x0000000000000000000000000000000000000002",
  NEXT_PUBLIC_TBV_AAVE_CONTROLLER: "0x0000000000000000000000000000000000000003",
  NEXT_PUBLIC_TBV_BTC_VAULT: "0x0000000000000000000000000000000000000004",
  NEXT_PUBLIC_TBV_MORPHO: "0x0000000000000000000000000000000000000005",
  NEXT_PUBLIC_TBV_GRAPHQL_ENDPOINT: "http://localhost:9999/graphql",
  NEXT_PUBLIC_REOWN_PROJECT_ID: "test-project-id-12345",
  NEXT_PUBLIC_SENTRY_DSN: "https://test@o12345.ingest.sentry.io/12345",
  NEXT_PUBLIC_SIDECAR_API_URL: "http://localhost:8092",
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: "e2e-test",
};

export default defineConfig({
  testDir: path.join(__dirname, "e2e"),
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
