import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// Load environment variables from .env.local
dotenv.config({ path: ".env.local" });

const globalSetup = "./tests/e2e/setup/globalSetup";

// Use process.env.PORT by default and fallback to port 6006
const PORT = process.env.PORT || 6006;

// Set webServer.url and use.baseURL with the location of the WebServer respecting the correct set port
const baseURL = `http://localhost:${PORT}`;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  globalSetup,
  testDir: "./tests",
  testMatch: ["**/*.spec.ts", "**/*.test.ts"],
  testIgnore: "**/fixtures/extensions/**/*.test.js",
  timeout: 120000, // 2 minutes
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: 0,
  /* Opt out of parallel tests on CI. */
  workers: 2,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
    locale: "en-US",
    launchOptions: {
      args: ["--lang=en-US", "--force-lang=en-US", "--accept-lang=en-US"],
    },
  },
  /* Configure projects for major browsers */
  projects: [
    {
      name: "unit",
      testDir: "./tests/unit",
      testMatch: "**/*.test.ts",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "e2e",
      testDir: "./tests/e2e",
      testMatch: "**/*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        locale: "en-US",
        launchOptions: {
          args: ["--lang=en-US", "--force-lang=en-US", "--accept-lang=en-US"],
        },
      },
    },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],
  /* Run your local dev server before starting the tests */
  webServer: {
    command: "npm run dev",
    url: baseURL,
    timeout: 120 * 1000,
    reuseExistingServer: true,
    env: {
      E2E_WALLET_MNEMONIC: process.env.E2E_WALLET_MNEMONIC!,
      E2E_WALLET_PASSWORD: process.env.E2E_WALLET_PASSWORD!,
    },
  },
});
