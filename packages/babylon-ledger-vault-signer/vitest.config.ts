import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**"],
    // 5s (vitest's default) is too tight for a suite whose tests dynamically
    // import heavy mocked packages on a shared CI runner. Raised so a slow
    // runner reports a slow test rather than a failed one.
    testTimeout: 20_000,
    // Only with an emulator attached: the e2e files share ONE Speculos device,
    // and an APDU arriving mid-UX-flow answers 0x6901 (sdk `status_words.h:56`).
    // Predicate matches the suites' own skipIf, which treats "" as unset.
    fileParallelism: (process.env.SPECULOS_URL ?? "") === "",
  },
});
