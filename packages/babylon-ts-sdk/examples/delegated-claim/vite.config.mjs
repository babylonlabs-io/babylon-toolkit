import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const here = fileURLToPath(new URL(".", import.meta.url));
const sdkDist = fileURLToPath(new URL("../../dist/index.js", import.meta.url));

// The page imports the SDK by its published name so it reads the way a
// consumer's code does. Point that name at the local build — run
// `pnpm --filter @babylonlabs-io/ts-sdk run build` first.
export default defineConfig({
  root: here,
  base: "./",
  resolve: { alias: { "@babylonlabs-io/babylon-ts-sdk": sdkDist } },
  build: { outDir: "dist", emptyOutDir: true, target: "es2022" },
});
