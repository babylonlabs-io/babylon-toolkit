import path from "path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
  resolve: {
    // Mirror the `@/*` -> `src/*` tsconfig path mapping. A bounded `^@/` regex
    // is used so `@scope/pkg` imports (e.g. `@visx/scale`) are left alone.
    alias: [{ find: /^@\//, replacement: path.resolve(__dirname, "src") + "/" }],
  },
});
