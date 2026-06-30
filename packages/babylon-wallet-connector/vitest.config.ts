import path from "path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// React/provider tests run under vitest + jsdom. The pure-function unit tests
// under `tests/unit` stay on the Playwright runner, so this config is scoped to
// `src/**` only and explicitly excludes the Playwright `tests/` directory to
// keep the two runners from picking up each other's files.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "tests/**"],
  },
  resolve: {
    // Mirror the `@/*` -> `src/*` tsconfig path mapping. A bounded `^@/` regex
    // is used so `@scope/pkg` imports (e.g. `@noble/hashes`) are left alone.
    alias: [{ find: /^@\//, replacement: path.resolve(__dirname, "src") + "/" }],
  },
});
