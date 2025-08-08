import { defineConfig } from 'eslint/config';
import jsonParser from 'jsonc-eslint-parser';
import pkgJson from 'eslint-plugin-package-json';

/**
 * This eslint config is here to lint the root level package.json
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export default defineConfig([
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
