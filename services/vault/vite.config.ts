import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import EnvironmentPlugin from "vite-plugin-environment";
import tsconfigPaths from "vite-tsconfig-paths";

const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
      },
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          babylon: ["@babylonlabs-io/core-ui"],
        },
      },
    },
  },
  plugins: [
    react(),
    tsconfigPaths({
      projects: [resolve(__dirname, "./tsconfig.lib.json")],
    }),
    EnvironmentPlugin("all", { prefix: "NEXT_PUBLIC_" }),
  ],
  define: {
    "import.meta.env.NEXT_PUBLIC_COMMIT_HASH": JSON.stringify(
      process.env.NEXT_PUBLIC_COMMIT_HASH || "development",
    ),
    "import.meta.env.NEXT_PUBLIC_CANONICAL": JSON.stringify(
      process.env.NEXT_PUBLIC_CANONICAL || "https://babylonlabs.io/",
    ),
    "process.env.NEXT_TELEMETRY_DISABLED": JSON.stringify("1"),
  },
});
