import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    react(),
    dts({
      tsconfigPath: "./tsconfig.lib.json",
      // Tests and their setup must not ship in the published tarball.
      exclude: ["src/**/*.stories.(ts|tsx)", "src/**/__tests__/**", "src/test/**"],
    }),
  ],
  build: {
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, "src/index.tsx"),
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format}.js`,
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime", "tailwind-merge", "yup"],
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
