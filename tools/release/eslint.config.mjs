import { typescriptConfig } from '@internal/eslint-config/typescript';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  ...typescriptConfig,
  {
    ignores: ['node_modules/**', '*.config.mjs', '*.config.ts'],
  },
]);
