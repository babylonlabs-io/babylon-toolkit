import { typescriptConfig } from "@internal/eslint-config/typescript";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  ...typescriptConfig,
  {
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "nx/enforce-module-boundaries": "off",
    },
  },
  // CRITICAL PATHS - see CLAUDE.md > "CRITICAL PATHS — HUMAN REVIEW REQUIRED".
  // These overrides force strict typing on value-bearing code, overriding
  // the package-wide no-explicit-any: off. Tests are excluded - non-null
  // assertions on fixtures are legitimate there.
  {
    files: [
      "src/tbv/core/utils/utxo/selectUtxos.ts",
      "src/tbv/core/primitives/psbt/payout.ts",
      "src/tbv/integrations/aave/utils/vaultSplit.ts",
      "src/tbv/core/utils/signing.ts",
    ],
    ignores: ["**/__tests__/**", "**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/ban-ts-comment": "error",
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
