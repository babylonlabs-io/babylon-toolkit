import path from "path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

const CONTRACTS_TEST_DIR = "src/__tests__/contracts";

const SHARED_EXCLUDE = [
  "**/node_modules/**",
  "**/dist/**",
  // Playwright specs and helpers - not vitest. Fixture unit tests
  // under `e2e/fixtures/__tests__/` are intentionally NOT excluded.
  "**/e2e/**/*.spec.ts",
  "**/e2e/helpers/**",
];

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
      NEXT_PUBLIC_ETH_RPC_URL: "https://test.example/eth",
    },
    exclude: SHARED_EXCLUDE,
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
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          exclude: [...SHARED_EXCLUDE, `${CONTRACTS_TEST_DIR}/**`],
        },
      },
      {
        extends: true,
        test: {
          name: "contracts",
          include: [`${CONTRACTS_TEST_DIR}/**/*.test.ts`],
        },
        // Cross-package contract tests read ts-sdk and the signer from src/ so a
        // source regression fails them without a rebuild; WASM stays on dist (Rust-built).
        resolve: {
          alias: [
            {
              find: /^@babylonlabs-io\/ts-sdk\/(.*)$/,
              replacement: path.resolve(
                __dirname,
                "../../packages/babylon-ts-sdk/src/$1/index.ts",
              ),
            },
            {
              find: "@babylonlabs-io/ledger-vault-signer",
              replacement: path.resolve(
                __dirname,
                "../../packages/babylon-ledger-vault-signer/src/index.ts",
              ),
            },
          ],
        },
      },
    ],
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
