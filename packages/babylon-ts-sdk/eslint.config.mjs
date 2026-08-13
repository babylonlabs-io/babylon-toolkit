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
      "src/tbv/core/utils/fee/peginFeeMath.ts",
      "src/tbv/core/primitives/psbt/payout.ts",
      "src/tbv/core/services/deposit/signDepositorGraph.ts",
      "src/tbv/core/vault-secrets/**/*.ts",
      "src/tbv/core/wots/blockDerivation.ts",
      "src/tbv/core/managers/PeginManager.ts",
      "src/tbv/integrations/aave/utils/vaultSplit.ts",
      "src/tbv/core/utils/signing.ts",
      "src/tbv/core/clients/eth/pegin-transaction.ts",
      "src/tbv/core/clients/eth/pegin-registration-client.ts",
      "src/tbv/core/clients/eth/onChainBtcPubkey.ts",
      "src/tbv/core/wasm/**/*.ts",
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
