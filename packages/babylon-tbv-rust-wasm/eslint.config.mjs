import { typescriptConfig } from "@internal/eslint-config/typescript";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  ...typescriptConfig,
  {
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  // CRITICAL PATHS - see CLAUDE.md > "CRITICAL PATHS — HUMAN REVIEW REQUIRED".
  // The WASM boundary is the highest-risk critical path - silent type coercion
  // here can produce wrong BTC amounts. The loader and raw entries are the
  // crossing itself, so they carry the same rules as the facade.
  {
    files: [
      "src/index.ts",
      "src/index-node.ts",
      "src/wasm-loader.ts",
      "src/wasm-loader-node.ts",
      "src/raw.ts",
      "src/raw-node.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/ban-ts-comment": "error",
    },
  },
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "*.config.js",
      "*.config.mjs",
    ],
  },
]);
