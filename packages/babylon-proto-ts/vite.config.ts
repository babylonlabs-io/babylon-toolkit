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
      entry: path.resolve(__dirname, "src/index.ts"),
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format === "es" ? "js" : "cjs"}`,
    },
    rollupOptions: {
      // Externalize dependencies - don't bundle them
      external: [
        "@bufbuild/protobuf",
        "@cosmjs/proto-signing",
        "@cosmjs/stargate",
        "@cosmjs/tendermint-rpc",
        // Also externalize cosmjs sub-dependencies
        "@cosmjs/amino",
        "@cosmjs/crypto",
        "@cosmjs/encoding",
        "@cosmjs/math",
        "@cosmjs/utils",
        "@cosmjs/socket",
        "@cosmjs/stream",
        "@cosmjs/json-rpc",
        "cosmjs-types",
      ],
      output: {
        sourcemapExcludeSources: false,
      },
    },
  },
  esbuild: { legalComments: "none" },
});
