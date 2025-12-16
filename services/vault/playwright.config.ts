import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = 5173;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: path.join(__dirname, "e2e"),
  fullyParallel: true,
  forbidOnly: false,
  retries: 2,
  timeout: 90_000,
  workers: 1,
  reporter: "html",

  use: {
    baseURL,
    headless: true,
    trace: "on-first-retry",
  },

  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],

  webServer: {
    command: `pnpm exec vite --port ${PORT}`,
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
