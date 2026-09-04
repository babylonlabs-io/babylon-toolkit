import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

import { TEST_TIMEOUT_MS } from "../../vitest.shared";

export default defineConfig({
  optimizeDeps: {
    include: ["@noble/curves/secp256k1.js"],
  },
  test: {
    globals: true,
    // This suite protects the SDK boundary that Vault uses. Run the same
    // checks in Node and Chromium to detect browser-only behavior.
    include: [
      "src/tbv/core/primitives/psbt/__tests__/assertWasmPeginSizing.test.ts",
    ],
    setupFiles: ["./src/test/setup.browser.ts"],
    testTimeout: TEST_TIMEOUT_MS,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
});
