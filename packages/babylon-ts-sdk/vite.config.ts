import path from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    dts({
      tsconfigPath: "./tsconfig.lib.json",
      insertTypesEntry: true,
      include: ["src"],
    }),
  ],
  build: {
    outDir: "dist",
    sourcemap: true,
    lib: {
      entry: {
        index: path.resolve(__dirname, "src/index.ts"),
        "tbv/index": path.resolve(__dirname, "src/tbv/index.ts"),
        "tbv/core/index": path.resolve(__dirname, "src/tbv/core/index.ts"),
        "tbv/core/primitives/index": path.resolve(
          __dirname,
          "src/tbv/core/primitives/index.ts",
        ),
        "tbv/integrations/morpho/index": path.resolve(
          __dirname,
          "src/tbv/integrations/morpho/index.ts",
        ),
        "shared/index": path.resolve(__dirname, "src/shared/index.ts"),
      },
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: [
        "bitcoinjs-lib",
        "@bitcoin-js/tiny-secp256k1-asmjs",
        "@babylonlabs-io/babylon-tbv-rust-wasm",
        "viem",
      ],
      output: {
        sourcemapExcludeSources: false,
      },
    },
  },
  esbuild: { legalComments: "none" },
});
