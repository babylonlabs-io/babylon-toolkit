import { defineConfig } from "eslint/config";
import { reactConfig } from "@internal/eslint-config/react";

export default defineConfig([
  ...reactConfig,
  {
    rules: {
      "tailwindcss/no-custom-classname": 0,
    },
  }
]);