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
      fileName: (format) => `index.${format}.js`,
    },
    rollupOptions: {
      external: [
        "@bufbuild/protobuf",
        "@cosmjs/proto-signing",
        "@cosmjs/stargate",
        "@cosmjs/tendermint-rpc",
        "cosmjs-types",
      ],
    },
  },
});
