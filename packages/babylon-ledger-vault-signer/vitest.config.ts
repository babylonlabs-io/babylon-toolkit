import { defineConfig } from "vitest/config";

import { TEST_TIMEOUT_MS } from "../../vitest.shared";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**"],
    testTimeout: TEST_TIMEOUT_MS,
    // Only with an emulator attached: the e2e files share ONE Speculos device,
    // and an APDU arriving mid-UX-flow answers 0x6901 (sdk `status_words.h:56`).
    // Predicate matches the suites' own skipIf, which treats "" as unset.
    fileParallelism: (process.env.SPECULOS_URL ?? "") === "",
  },
});
