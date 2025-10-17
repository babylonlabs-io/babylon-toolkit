import { defineConfig } from "eslint/config";
import { reactConfig } from "@internal/eslint-config/react";
import tseslint from "typescript-eslint";

export default defineConfig([
  ...reactConfig,
  {
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "tailwindcss/no-custom-classname": 0,
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_|^error$"
        }
      ]
    },
  }
]);
