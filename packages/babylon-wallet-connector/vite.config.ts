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
      exclude: ["src/**/*.stories.tsx"],
    }),
    nodePolyfills(),
  ],
  build: {
    outDir: "dist",
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, "src/index.tsx"),
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format}.js`,
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
        // "bitcoinjs-lib", // Bundle bitcoinjs-lib since we use deep imports from it
        "@keystonehq/animated-qr",
        // Issues linking with Next.js
        // "@keystonehq/keystone-sdk",
        "@keystonehq/sdk",
        "@tomo-inc/wallet-connect-sdk", // Externalize to avoid bundling its deep imports
        "usehooks-ts", // Externalize to avoid CommonJS interop issues
        // @reown packages that use viem internally
        "@reown/appkit",
        "@reown/appkit-adapter-wagmi",
        "@reown/appkit-adapter-bitcoin",
        /^@reown\//, // Match all @reown/* packages
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
