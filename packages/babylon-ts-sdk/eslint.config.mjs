import { typescriptConfig } from "@internal/eslint-config/typescript";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  ...typescriptConfig,
  {
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "nx/enforce-module-boundaries": "off",
    },
  },
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "docs/**",
      "*.config.js",
      "*.config.mjs",
      "*.config.ts",
    ],
  },
]);
