import { defineConfig } from "eslint/config";
import { reactConfig } from "@internal/eslint-config/react";

export default defineConfig([
  ...reactConfig,
  {
    rules: {
      "tailwindcss/no-custom-classname": 0,
      "@nx/enforce-module-boundaries": [
        "error",
        {
          allow: ["^viem.*"],
        },
      ],
    },
  }
]);