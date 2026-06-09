import { sentryVitePlugin } from "@sentry/vite-plugin";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import EnvironmentPlugin from "vite-plugin-environment";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import tsconfigPaths from "vite-tsconfig-paths";

const __dirname = dirname(fileURLToPath(import.meta.url));

function sriPlugin(): Plugin {
  const assetHashes = new Map<string, string>();
  return {
    name: "sri",
    apply: "build",
    generateBundle(_options, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        const content = chunk.type === "chunk" ? chunk.code : chunk.source;
        const contentBuffer =
          typeof content === "string" ? Buffer.from(content) : content;
        const hash = createHash("sha384")
          .update(contentBuffer)
          .digest("base64");
        assetHashes.set(fileName, `sha384-${hash}`);
      }
    },
    transformIndexHtml(html) {
      return html
        .replace(
          /<script ([^>]*?)src="([^"]+)"([^>]*?)>/g,
          (_match, before, src, after) => {
            const fileName = src.replace(/^\//, "");
            const integrity = assetHashes.get(fileName);
            if (!integrity) return _match;
            return `<script ${before}src="${src}" integrity="${integrity}" crossorigin="anonymous"${after}>`;
          },
        )
        .replace(
          /<link ([^>]*?)href="([^"]+\.js)"([^>]*?)>/g,
          (_match, before, href, after) => {
            const fileName = href.replace(/^\//, "");
            const integrity = assetHashes.get(fileName);
            if (!integrity) return _match;
            return `<link ${before}href="${href}" integrity="${integrity}" crossorigin="anonymous"${after}>`;
          },
        );
    },
  };
}

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
  resolve: {
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
