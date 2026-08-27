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
      "src/tbv/core/vault-secrets/**/*.ts",
      "src/tbv/core/wasm/**/*.ts",
      "src/tbv/core/clients/eth/pegin-transaction.ts",
      "src/tbv/core/clients/eth/onChainBtcPubkey.ts",
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
  // LAZY WASM BOUNDARY - see the module JSDoc in src/tbv/core/wasm/index.ts.
  // The optional engine peer is reachable only through src/tbv/core/wasm,
  // which imports it dynamically. A value import anywhere else in src/ puts
  // the engine back into every chunk that reaches the file, evaluated at
  // import time. Type-only imports are erased, so they stay allowed. Tests
  // read the engine directly on purpose - they are the differential oracle
  // for the values the boundary re-exports, and are never bundled.
  {
    files: ["src/**/*.ts"],
    ignores: ["src/tbv/core/wasm/**", "**/__tests__/**", "**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@babylonlabs-io/babylon-tbv-rust-wasm",
                "@babylonlabs-io/babylon-tbv-rust-wasm/*",
              ],
              allowTypeImports: true,
              message:
                "Reach the vault WASM engine through src/tbv/core/wasm, which loads it lazily.",
            },
          ],
        },
      ],
    },
  },
  // `import { type X } from "pkg"` leaves a side-effect import behind under
  // verbatimModuleSyntax, which would defeat allowTypeImports above. Keep
  // every type-only import in the top-level `import type` form.
  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-import-type-side-effects": "error",
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
