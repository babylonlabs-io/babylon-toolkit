import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    dts({
      tsconfigPath: "./tsconfig.lib.json",
      insertTypesEntry: true,
      include: ["src"],
      exclude: ["src/**/*.stories.tsx", "src/**/*.test.ts", "src/**/*.test.tsx", "src/__fixtures__/**"],
    }),
    nodePolyfills(),
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
      },
      formats: ["es", "cjs"],
      fileName: (format, entryName) => `${entryName}.${format}.js`,
      // Pinned because a multi-entry lib build otherwise names the stylesheet
      // after the package, changing the published `./style.css` target.
      cssFileName: "wallet-connector",
    },
    rollupOptions: {
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "tailwind-merge",
        "wagmi",
        "viem",
        "@cosmjs/stargate",
        "@babylonlabs-io/core-ui",
        "@babylonlabs-io/ledger-vault-signer",
        "bitcoinjs-lib",
        "@keystonehq/animated-qr",
        // Issues linking with Next.js
        // "@keystonehq/keystone-sdk",
        "@keystonehq/sdk",
        // @reown packages that use viem internally
        "@reown/appkit",
        "@reown/appkit-adapter-wagmi",
        "@reown/appkit-adapter-bitcoin",
        /^@reown\//, // Match all @reown/* packages
        // React Query must be external to share context with consuming app
        "@tanstack/react-query",
      ],
      output: {
        sourcemapExcludeSources: false,
      },
    },
  },
  esbuild: { legalComments: "none" },
  resolve: {
    alias: [{ find: "@", replacement: path.resolve(__dirname, "src") }],
  },
});
