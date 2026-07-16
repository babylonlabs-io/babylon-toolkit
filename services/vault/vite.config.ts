import { sentryVitePlugin } from "@sentry/vite-plugin";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import EnvironmentPlugin from "vite-plugin-environment";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import tsconfigPaths from "vite-tsconfig-paths";
import { sriPlugin } from "./src/build/sriPlugin";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Dev/preview-server response headers only. The Content-Security-Policy is deliberately NOT
// set here: it lives solely in the index.html <meta> tag (the single source of truth that
// also ships to the static S3/CDN prod build). Delivering the same CSP as a dev-server header
// additionally governs the inline React Fast Refresh preamble that @vitejs/plugin-react
// injects, which has no 'unsafe-inline'/nonce and would white-screen `pnpm dev`. The meta CSP
// does not govern that preamble because Vite injects it above the meta tag, and a meta policy
// only applies to content that follows it.
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

// Dev-server-only proxy for the sidecar API. The sidecar sends no
// Access-Control-Allow-Origin for http://localhost, so the browser's preflight of
// POST /logo (Content-Type: application/json) fails and provider logos never load.
// Routing the call through the dev server keeps it same-origin, so no preflight happens.
// Set SIDECAR_PROXY_TARGET to the sidecar host and point
// NEXT_PUBLIC_TBV_SIDECAR_API_URL at this prefix to use it; unset, the proxy is skipped
// and the app calls the sidecar directly, as it does in deployed builds.
const SIDECAR_PROXY_PATH = "/sidecar";
// .env is not loaded into process.env for this config module, so read it directly. The
// mode only selects extra .env.[mode] files; plain .env is always read.
const { SIDECAR_PROXY_TARGET: sidecarProxyTarget } = loadEnv(
  process.env.NODE_ENV ?? "development",
  __dirname,
  "SIDECAR_",
);

const sidecarProxy = sidecarProxyTarget
  ? {
      [SIDECAR_PROXY_PATH]: {
        target: sidecarProxyTarget,
        changeOrigin: true,
        rewrite: (path: string) =>
          path.replace(new RegExp(`^${SIDECAR_PROXY_PATH}`), ""),
      },
    }
  : undefined;

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
    proxy: sidecarProxy,
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
