import { typescriptConfig } from "@internal/eslint-config/typescript";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  ...typescriptConfig,
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      // Allow 'any' type when properly documented (e.g., test utilities, WASM interop)
      "@typescript-eslint/no-explicit-any": "off",

      // Strictly enforce no unused variables/imports
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // Allow imports from WASM package (not tagged with type:package)
      "nx/enforce-module-boundaries": [
        "error",
        {
          allow: ["@babylonlabs-io/babylon-tbv-rust-wasm"],
        },
      ],
    },
  },
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "*.config.js",
      "*.config.mjs",
      "*.config.ts",
    ],
  },
]);
