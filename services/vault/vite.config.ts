import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import EnvironmentPlugin from "vite-plugin-environment";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import tsconfigPaths from "vite-tsconfig-paths";

const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      // Provide empty stubs for Node.js-only modules
      ws: resolve(__dirname, "src/stubs/ws.ts"),
    },
  },
  optimizeDeps: {
    exclude: ["ws"],
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
      },
      external: (id) => {
        // The vite-plugin-node-polyfills plugin scans bundled code (including SDK output) for Buffer usage
        // and injects imports like "vite-plugin-node-polyfills/shims/buffer" during build.
        // These injected imports are internal to the plugin and can't be resolved by Rollup.
        // We must externalize them so they're not processed further.
        // Context: SDK bundles buffer polyfill from bitcoinjs-lib, plugin detects Buffer usage and tries to re-polyfill it
        if (id.includes("vite-plugin-node-polyfills/shims")) return true;

        // Already externalized in wallet-connector but still cause resolution errors during vault build
        if (id.startsWith("@reown/appkit")) return true;

        return false;
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
    nodePolyfills({
      include: ["buffer", "crypto"],
      globals: {
        Buffer: true,
      },
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
