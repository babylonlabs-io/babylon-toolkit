import { typescriptConfig } from "@internal/eslint-config/typescript";
import { defineConfig } from "eslint/config";

export default defineConfig([
  ...typescriptConfig,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': "off"
    }
  }
])
