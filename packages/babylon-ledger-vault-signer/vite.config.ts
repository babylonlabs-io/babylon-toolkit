import path from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    dts({
      tsconfigPath: "./tsconfig.lib.json",
      insertTypesEntry: true,
      include: ["src"],
      exclude: ["src/**/__tests__/**"],
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
  esbuild: { legalComments: "none" },
});
