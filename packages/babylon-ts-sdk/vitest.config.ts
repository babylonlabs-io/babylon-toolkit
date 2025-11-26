import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // Use forked processes for test execution to handle WASM initialization properly.
    // WASM loading is stateful - once initialized in a process, it remains loaded.
    // The babylon-tbv-rust-wasm package uses a singleton initWasm() pattern that
    // expects single-process execution. Running all tests in a single fork ensures
    // WASM is initialized once and shared consistently across all test files.
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/test/",
        "*.config.ts",
        "**/*.d.ts",
        "**/*.test.ts",
        "**/index.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
