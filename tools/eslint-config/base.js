import { defineConfig, globalIgnores } from 'eslint/config';
import nx from '@nx/eslint-plugin';
import jsonParser from 'jsonc-eslint-parser';
import pkgJson from 'eslint-plugin-package-json';

/**
 * A shared ESLint configuration for the repository.
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export const baseConfig = defineConfig([
  globalIgnores(['**/dist/', '**/.storybook']),
  {
    plugins: {
      nx,
    },
    files: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.js', 'src/**/*.jsx'],
    rules: {
      'nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          banTransitiveDependencies: true,
          allow: ['@'],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },
  {
    plugins: {
      pkgJson,
    },
    files: ['package.json'],
    languageOptions: {
      parser: jsonParser
    },
    rules: {
      'pkgJson/sort-collections': ["error", [
        "devDependencies",
        "dependencies",
        "peerDependencies"
      ]]
    },
  },
]);
