import { reactConfig } from "@internal/eslint-config/react";
import importOrder from "eslint-plugin-import";
import { defineConfig } from "eslint/config";

export default defineConfig([
  ...reactConfig,
  {
    plugins: { import: importOrder },
    rules: {
      "@typescript-eslint/no-explicit-any": 0,
      "no-empty-pattern": 0,
      "import/order": [
        "error",
        {
          groups: [
            ["builtin", "external"],
            ["internal", "parent", "sibling", "index"],
          ],
          pathGroups: [
            {
              pattern: "@/**",
              group: "internal",
              position: "before",
            },
            {
              pattern: "./**",
              group: "sibling",
              position: "after",
            },
          ],
          pathGroupsExcludedImportTypes: ["builtin", "external"],
          "newlines-between": "always",
        },
      ],
    },
  },
]);
