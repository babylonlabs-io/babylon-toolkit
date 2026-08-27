import { existsSync, readFileSync } from "fs";
import path from "path";
import type { Alias } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults, defineConfig } from "vitest/config";

const CONTRACTS_TEST_DIR = "src/__tests__/contracts";
const TS_SDK_DIR = path.resolve(__dirname, "../../packages/babylon-ts-sdk");
const SIGNER_DIR = path.resolve(
  __dirname,
  "../../packages/babylon-ledger-vault-signer",
);

const EXPORTS_SUBPATH_PREFIX = "./";
const BUILT_ENTRY_PREFIX = "./dist/";

/** Regex-escape per MDN's `escapeRegExp` (Guide > Regular expressions). */
function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface WorkspacePackageJson {
  name: string;
  exports: Record<string, unknown>;
}

function builtEntryOf(entry: unknown): string | undefined {
  if (typeof entry !== "object" || entry === null || !("import" in entry)) {
    return undefined;
  }
  const { import: target } = entry;
  return typeof target === "string" ? target : undefined;
}

/**
 * One exact-match alias per `exports` key, pointing the built entry at its
 * src/ twin — so only the package's public surface resolves from src/.
 */
function srcAliasesFromExports(packageDir: string): Alias[] {
  const pkg = JSON.parse(
    readFileSync(path.join(packageDir, "package.json"), "utf8"),
  ) as WorkspacePackageJson;
  return Object.entries(pkg.exports).map(([subpath, entry]) => {
    if (subpath !== "." && !subpath.startsWith(EXPORTS_SUBPATH_PREFIX)) {
      throw new Error(`${pkg.name}: unsupported exports key "${subpath}"`);
    }
    const builtEntry = builtEntryOf(entry);
    if (builtEntry === undefined) {
      throw new Error(
        `${pkg.name} exports "${subpath}" has no string "import" target`,
      );
    }
    if (!builtEntry.startsWith(BUILT_ENTRY_PREFIX)) {
      throw new Error(
        `${pkg.name} exports "${subpath}" -> "${builtEntry}" is not under ${BUILT_ENTRY_PREFIX}`,
      );
    }
    const specifier =
      subpath === "."
        ? pkg.name
        : `${pkg.name}/${subpath.slice(EXPORTS_SUBPATH_PREFIX.length)}`;
    const replacement = path.join(
      packageDir,
      "src",
      builtEntry.slice(BUILT_ENTRY_PREFIX.length).replace(/\.js$/, ".ts"),
    );
    if (!existsSync(replacement)) {
      throw new Error(
        `${pkg.name} exports "${subpath}" -> "${builtEntry}" has no src twin at ${replacement}`,
      );
    }
    return { find: new RegExp(`^${escapeRegExp(specifier)}$`), replacement };
  });
}

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
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      // Playwright specs and helpers - not vitest. Fixture unit tests
      // under `e2e/fixtures/__tests__/` are intentionally NOT excluded.
      "**/e2e/**/*.spec.ts",
      "**/e2e/helpers/**",
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
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          exclude: [`${CONTRACTS_TEST_DIR}/**`],
        },
      },
      {
        // Standalone on purpose: cross-package contract tests import no vault
        // module, so the root plugins, jsdom and app setup must not apply.
        test: {
          name: "contracts",
          environment: "node",
          include: configDefaults.include.map(
            (glob) => `${CONTRACTS_TEST_DIR}/${glob}`,
          ),
        },
        // Runtime modules resolve from src/ (unexported subpaths are refused by
        // the exports map); types still come from dist d.ts because tsc does
        // not see Vite aliases, so a type-level regression is still gated on a
        // rebuild. The WASM package stays on dist: it is Rust-built.
        resolve: {
          alias: [
            ...srcAliasesFromExports(TS_SDK_DIR),
            ...srcAliasesFromExports(SIGNER_DIR),
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
