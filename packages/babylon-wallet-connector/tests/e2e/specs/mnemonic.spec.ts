import { test } from "../fixtures/setupExtensions";

test("Setup OKX and Keplr wallets", async ({ setupExtensions }) => {
  // Initialize browser context with required wallet extensions
  const { context } = await setupExtensions(["OKX", "KEPLR"]);

  // Create a new page to verify extension setup
  const page = await context.newPage();

  // Navigate to root URL
  // This step could be updated to navigate to a specific testing page
  await page.goto("/");

  // If anything goes wrong, the test will fail
});
