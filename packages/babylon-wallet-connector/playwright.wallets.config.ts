import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// Load E2E_WALLET_MNEMONIC / E2E_WALLET_PASSWORD from .env.local.
dotenv.config({ path: ".env.local" });

/**
 * Dedicated config for the real-extension wallet specs (UniSat / MetaMask / OKX / OneKey / combined).
 *
 * Unlike the main `playwright.config.ts`, this has NO `webServer`: these specs only drive
 * `chrome-extension://` pages, so they must not depend on (or wait for) Storybook. Extensions are
 * downloaded by `globalSetup`. The persistent, headed context is created per-spec by
 * `launchWalletContext`, so no browser options are needed here beyond English forcing.
 */
export default defineConfig({
  globalSetup: "./tests/e2e/setup/globalSetup",
  testDir: "./tests/e2e/specs/wallets",
  testMatch: "**/*.spec.ts",
  timeout: 240000, // wallet onboarding + the combined two-wallet flow
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1, // one headed persistent context at a time
  reporter: "list",
  use: {
    trace: "on-first-retry",
    locale: "en-US",
    launchOptions: {
      args: ["--lang=en-US", "--force-lang=en-US", "--accept-lang=en-US"],
    },
  },
  projects: [{ name: "wallets", use: { ...devices["Desktop Chrome"] } }],
});
