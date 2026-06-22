import { sentryVitePlugin } from "@sentry/vite-plugin";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import EnvironmentPlugin from "vite-plugin-environment";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import tsconfigPaths from "vite-tsconfig-paths";
import { sriPlugin } from "./src/build/sriPlugin";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' https: http: wss: ws:; img-src 'self' data: https: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data: https:; object-src 'none'; base-uri 'self'; worker-src 'self' blob:;",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

const isSentryDisabled =
  process.env.NEXT_BUILD_E2E || process.env.DISABLE_SENTRY === "true";

const enableSentryPlugin =
  !isSentryDisabled &&
  Boolean(
    process.env.SENTRY_AUTH_TOKEN &&
      process.env.SENTRY_ORG &&
      process.env.SENTRY_PROJECT,
  );

// https://vite.dev/config/
export default defineConfig({
  server: {
    headers: SECURITY_HEADERS,
  },
  resolve: {
    dedupe: ["@babylonlabs-io/core-ui", "react", "react-dom"],
    alias: {
      // Provide empty stubs for Node.js-only modules
      ws: resolve(__dirname, "src/stubs/ws.ts"),
    },
  },
  optimizeDeps: {
    exclude: ["ws"],
    include: [
      "bitcoinjs-lib",
      "@bitcoin-js/tiny-secp256k1-asmjs",
      "@babylonlabs-io/wallet-connector",
      "@babylonlabs-io/core-ui",
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
          babylon: ["@babylonlabs-io/core-ui"],
        },
      },
    },
  },
  plugins: [
    sriPlugin(),
    react(),
    tsconfigPaths({
      projects: [resolve(__dirname, "./tsconfig.lib.json")],
    }),
    nodePolyfills({
      include: ["crypto"],
      globals: {
        Buffer: true,
        global: false,
      },
    }),
    EnvironmentPlugin("all", { prefix: "NEXT_PUBLIC_" }),
    sentryVitePlugin({
      disable: !enableSentryPlugin,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      url: process.env.SENTRY_URL,
      release: {
        name: process.env.SENTRY_RELEASE,
        dist: process.env.SENTRY_DIST,
      },
      sourcemaps: {
        assets: "./dist/**",
      },
      silent: !process.env.CI,
      telemetry: false,
      errorHandler: (err) => {
        console.warn("⚠️ Sentry encountered an error during build:");
        console.warn("⚠️", err.message);
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
});
