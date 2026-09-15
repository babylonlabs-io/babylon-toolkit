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
  workers: process.env.CI ? 1 : 2,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "line",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,
    trace: "off",
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
      // Real-extension wallet specs run under playwright.wallets.config.ts (no Storybook webServer).
      testIgnore: "**/specs/wallets/**",
      use: {
        ...devices["Desktop Chrome"],
        trace: "off",
        screenshot: "off",
        video: "off",
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
    command: process.env.CI
      ? "pnpm run build-storybook && pnpm exec vite preview --outDir storybook-static --port 6006 --strictPort"
      : "npm run dev",
    url: `${baseURL}/iframe.html`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
  },
});
