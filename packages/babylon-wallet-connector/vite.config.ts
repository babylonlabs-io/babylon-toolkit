import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { nodePolyfills } from "vite-plugin-node-polyfills";

import { requiredExternals, walletExternals } from "./scripts/package-boundary.js";

// The plugin's buffer shim, resolved to an absolute path through its `import` condition: the
// ESM file the plugin's build-time inject resolves to for the global `Buffer`. Aliasing bare
// `buffer` here (for `import` and `require` alike) leaves the built bundle with one Buffer class.
// Dev-server pre-bundling (`storybook dev`) still injects the shim's `.cjs` file, so dev keeps two. Keystone's bundled CBOR encoder
// writes a value as bytes only if `value instanceof Buffer`; with a second class, PSBT QR codes
// are encoded as `{type:"Buffer",data:[...]}` and the device rejects them as "Invalid QR Code".
// Not `include: ["buffer"]`: that aliases to the bare id `vite-plugin-node-polyfills/shims/buffer`,
// which workspace packages Storybook bundles (ledger-vault-signer) cannot resolve under pnpm (#2384).
const BUFFER_SHIM_PATH = fileURLToPath(import.meta.resolve("vite-plugin-node-polyfills/shims/buffer"));

export default defineConfig({
  plugins: [
    react(),
    dts({
      tsconfigPath: "./tsconfig.lib.json",
      insertTypesEntry: true,
      include: ["src"],
      exclude: ["src/**/*.stories.tsx", "src/**/*.test.ts", "src/**/*.test.tsx", "src/__fixtures__/**"],
    }),
    nodePolyfills({ include: ["crypto", "stream"] }),
  ],
  build: {
    outDir: "dist",
    sourcemap: true,
    commonjsOptions: {
      // Bundled CJS (@bitcoinerlab/descriptors) does `require("bitcoinjs-lib").payments`.
      // plugin-commonjs renders requires of externals as *default* imports unless the id
      // is listed here, and bitcoinjs-lib is __esModule with no default export — so the
      // default is undefined once a consumer pre-bundles us. Namespace import instead.
      esmExternals: ["bitcoinjs-lib"],
    },
    lib: {
      entry: {
        index: path.resolve(__dirname, "src/index.tsx"),
        eth: path.resolve(__dirname, "src/eth.ts"),
        "btc-eth": path.resolve(__dirname, "src/btc-eth.ts"),
      },
      formats: ["es", "cjs"],
      fileName: (format, entryName) => (format === "cjs" ? `${entryName}.cjs` : `${entryName}.${format}.js`),
      // Pinned because a multi-entry lib build otherwise names the stylesheet
      // after the package, changing the published `./style.css` target.
      cssFileName: "wallet-connector",
    },
    rollupOptions: {
      // Bundle BitcoinJS deep imports so Node ESM does not receive extensionless paths.
      external: (id) =>
        [...requiredExternals, ...walletExternals].some(
          (name) => id === name || (name !== "bitcoinjs-lib" && id.startsWith(`${name}/`)),
        ) || id.startsWith("@reown/"),
      output: {
        sourcemapExcludeSources: false,
      },
    },
  },
  esbuild: { legalComments: "none" },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      // `buffer/` too: bc-ur-registry re-exports its `Buffer` from `require("buffer/")`.
      { find: /^buffer\/?$/, replacement: BUFFER_SHIM_PATH },
    ],
  },
});
