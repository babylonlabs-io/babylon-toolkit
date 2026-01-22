import { createSentryVitePlugin } from "@babylonlabs-io/observability/vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import EnvironmentPlugin from "vite-plugin-environment";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { VitePluginRadar } from "vite-plugin-radar";
import tsconfigPaths from "vite-tsconfig-paths";

const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  optimizeDeps: {
    include: [
      "bitcoinjs-lib",
      "@bitcoin-js/tiny-secp256k1-asmjs",
      "@babylonlabs-io/btc-staking-ts",
    ],
  },
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
          bitcoin: ["@bitcoin-js/tiny-secp256k1-asmjs", "bitcoinjs-lib"],
          cosmos: ["@cosmjs/proto-signing", "@cosmjs/stargate"],
          babylon: [
            "@babylonlabs-io/babylon-proto-ts",
            "@babylonlabs-io/btc-staking-ts",
            "@babylonlabs-io/core-ui",
          ],
          wallets: ["@babylonlabs-io/wallet-connector"],
        },
      },
    },
  },
  plugins: [
    react(),
    tsconfigPaths({
      projects: [resolve(__dirname, "./tsconfig.lib.json")],
    }),
    nodePolyfills({ include: ["buffer", "crypto"] }),
    EnvironmentPlugin("all", { prefix: "NEXT_PUBLIC_" }),
    createSentryVitePlugin({
      isE2EBuild: Boolean(process.env.NEXT_BUILD_E2E),
      isDisabled: process.env.DISABLE_SENTRY === "true",
    }),
    VitePluginRadar({
      analytics: {
        id: process.env.GA4_MEASUREMENT_ID ?? "",
        disable: !process.env.GA4_MEASUREMENT_ID,
        config: {
          cookie_flags: "SameSite=None;Secure",
          cookie_domain: "babylonlabs.io",
        },
      },
    }),
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
  resolve: {
    alias: {
      // Stub out Node.js-only packages for browser
      ws: resolve(__dirname, "src/stubs/ws.ts"),
    },
  },
});
