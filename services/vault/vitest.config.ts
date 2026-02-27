import path from "path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    tsconfigPaths({
      projects: [
        path.resolve(__dirname, "./tsconfig.lib.json"),
        path.resolve(
          __dirname,
          "../../packages/babylon-wallet-connector/tsconfig.lib.json",
        ),
      ],
    }),
  ],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    env: {
      NEXT_PUBLIC_BTC_NETWORK: "signet",
      NEXT_PUBLIC_ETH_CHAINID: "11155111", // Sepolia
    },
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/integration.test.tsx",
      "**/e2e/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/test/",
        "*.config.ts",
        "**/*.d.ts",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/index.ts",
      ],
    },
    server: {
      deps: {
        inline: ["@babylonlabs-io/wallet-connector", "@noble/hashes"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@/components": path.resolve(__dirname, "./src/components"),
      "@/hooks": path.resolve(__dirname, "./src/hooks"),
      "@/services": path.resolve(__dirname, "./src/services"),
      "@/utils": path.resolve(__dirname, "./src/utils"),
      "@/types": path.resolve(__dirname, "./src/types"),
      "@/models": path.resolve(__dirname, "./src/models"),
      "@/config": path.resolve(__dirname, "./src/config"),
      "@/storage": path.resolve(__dirname, "./src/storage"),
      "@/context": path.resolve(__dirname, "./src/context"),
    },
  },
});
