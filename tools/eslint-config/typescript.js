import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import js from "@eslint/js";
import tseslint from "typescript-eslint";

import { baseConfig } from './base.js';

/**
 * A shared ESLint configuration for the repository.
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export const typescriptConfig = defineConfig([
  ...baseConfig,
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended
    ]
  },
  prettier,
]);
