import { typescriptConfig } from "@internal/eslint-config/typescript";
import { defineConfig } from "eslint/config";

export default defineConfig([
  ...typescriptConfig,
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**", "*.config.ts", "*.config.mjs"],
  },
]);
