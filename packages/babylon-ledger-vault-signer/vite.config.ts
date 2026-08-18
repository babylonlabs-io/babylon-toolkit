import path from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const DIST_DIR = path.resolve(__dirname, "dist");

// beforeWriteFile receives an ABSOLUTE destination path (vite-plugin-dts@4.5.4,
// dist/index.mjs: `resolve(outDir, relative(entryRoot, filePath))`), so the test is
// anchored to dist and matched per path segment. A bare substring match dropped every
// declaration — including dist/index.d.ts — when the checkout itself lived under a
// directory named "vendor", and the build still exited 0.
const isVendorDeclaration = (filePath: string) => path.relative(DIST_DIR, filePath).split(/[\\/]/).includes("vendor");

export default defineConfig({
  plugins: [
    dts({
      tsconfigPath: "./tsconfig.lib.json",
      insertTypesEntry: true,
      include: ["src"],
      // Vendored files stay IN the declaration program (index.ts reaches them
      // through signPsbt.ts; excluding them makes tsc report TS6307 on every
      // vendor import), but their declarations are dropped before write.
      exclude: ["src/**/__tests__/**"],
      // No vendored .d.ts ships: the first-party modules type the vendored
      // surfaces structurally, so no emitted declaration references src/vendor.
      beforeWriteFile: (filePath) => (isVendorDeclaration(filePath) ? false : undefined),
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
        "@bitcoin-js/tiny-secp256k1-asmjs",
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
