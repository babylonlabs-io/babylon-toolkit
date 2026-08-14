import path from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    dts({
      tsconfigPath: "./tsconfig.lib.json",
      insertTypesEntry: true,
      include: ["src"],
      // Vendored SIGN_PSBT primitives are unreferenced by index.ts (test-only
      // until #2219) — keep their declarations out of the published dist too,
      // so nothing vendored ships until the code is actually wired in.
      exclude: ["src/**/__tests__/**", "src/vendor/**"],
    }),
  ],
  build: {
    outDir: "dist",
    sourcemap: true,
    lib: {
      entry: {
        index: path.resolve(__dirname, "src/index.ts"),
      },
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: [
        "@ledgerhq/device-management-kit",
        "@ledgerhq/device-transport-kit-web-hid",
        "@scure/bip32",
        "bitcoinjs-lib",
        "buffer",
        "rxjs",
      ],
      output: {
        sourcemapExcludeSources: false,
      },
    },
  },
  // Strips comments from dist/, including the vendored files' Apache-2.0 §4(b)
  // provenance headers. That attribution deliberately lives in
  // THIRD-PARTY-NOTICES.md (shipped via `files`), which is the redistribution
  // record — revisit if the vendored source ever needs its headers in-bundle.
  esbuild: { legalComments: "none" },
});
