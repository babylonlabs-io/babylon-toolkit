import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import-x";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

const USEHOOKS_BAN = {
  name: "@uidotdev/usehooks",
  message: "@uidotdev/usehooks is banned in this workspace.",
};

// The app must mount exactly ONE PeginPollingProvider. A second mount silently
// forks polling and optimistic-completion state: an action completed under one
// provider is invisible to a row rendered under the other, which is precisely
// how a satisfied action kept offering its button. `AppPeginPollingProvider` is
// the only sanctioned mount; everything else consumes the hooks.
//
// A `patterns` ban (not `paths`): `no-restricted-imports` matches the literal
// specifier, so a `paths` list would have to enumerate the alias plus every
// relative depth in use and grow whenever the tree deepens. `**/` matches any
// number of leading segments — including `./` and `../../../` — so one entry
// covers every spelling at once.
const PEGIN_POLLING_PROVIDER_PATTERN_BAN = {
  group: ["@/context/deposit/PeginPollingContext", "**/PeginPollingContext"],
  importNames: ["PeginPollingProvider"],
  message:
    "Mount the peg-in polling provider only via AppPeginPollingProvider — the app must have exactly one. Read polling state through usePeginPolling / useDepositPollingResult instead.",
};

// Production code must not import `src/dev` (see the dev-boundary block).
// Declared once and re-used by every block that re-declares
// `no-restricted-imports`, so the ban cannot silently drop out of a scope.
const DEV_IMPORT_PATTERN_BAN = {
  // Both the alias and relative spellings: no-restricted-imports matches the
  // literal import specifier, not the resolved path, so "@/dev/*" alone would
  // let "../dev/*" slip through.
  group: ["@/dev", "@/dev/*", "**/dev", "**/dev/*"],
  message:
    "Dev-only tooling in src/dev must not be imported by production code. Add a new sanctioned seam to the src/dev boundary override in eslint.config.js only if truly required.",
};

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".next",
      "node_modules",
      "tests",
      // Playwright specs and helpers are not linted; fixture units are.
      "e2e/**/*.spec.ts",
      "e2e/helpers/**",
      "test-results",
      "playwright-report",
      "blob-report",
      "playwright/.cache",
      "out",
      "wasm",
      "*.{js,ts}",
      "postcss.config.cjs",
      "prettier.config.cjs",
      "scripts",
      "public",
    ],
  },
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{js,mjs,cjs,jsx,mjsx,ts,tsx,mtsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "no-console": "error",
      ...reactHooks.configs.recommended.rules,
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/no-unused-expressions": "error",
      "import-x/no-unused-modules": "error",
      "no-restricted-imports": [
        "error",
        {
          paths: [USEHOOKS_BAN],
          patterns: [PEGIN_POLLING_PROVIDER_PATTERN_BAN],
        },
      ],
      "import-x/no-unresolved": [
        "error",
        {
          ignore: [
            "@bitcoin-js/tiny-secp256k1-asmjs",
            "@babylonlabs-io/ts-sdk",
            "@babylonlabs-io/ts-sdk/tbv/core",
          ],
        },
      ],
      "import-x/order": [
        "error",
        {
          groups: [
            ["builtin", "external"],
            ["internal", "parent", "sibling", "index"],
          ],
          pathGroups: [
            {
              pattern: "@/**",
              group: "internal",
              position: "before",
            },
            {
              pattern: "./**",
              group: "sibling",
              position: "after",
            },
          ],
          pathGroupsExcludedImportTypes: ["builtin", "external"],
          "newlines-between": "always",
        },
      ],
    },
  },
  eslintPluginPrettierRecommended,
  {
    files: [
      "**/test/**",
      "**/__tests__/**",
      "**/*.test.{ts,tsx}",
      "**/setup.ts",
      "vite.config.ts",
    ],
    rules: {
      "no-console": "off",
    },
  },
  // CRITICAL PATHS - see CLAUDE.md > "CRITICAL PATHS — HUMAN REVIEW REQUIRED".
  // These overrides ensure escape hatches (any, non-null assertions, raw
  // @ts-ignore) cannot slip into value-bearing code without explicit review.
  // Tests are excluded - non-null assertions on fixtures are legitimate there.
  {
    files: [
      "src/hooks/deposit/depositFlowSteps/payoutSigning.ts",
      "src/services/wots/**/*.ts",
      "src/services/vault/vaultActivationService.ts",
    ],
    ignores: ["**/__tests__/**", "**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/ban-ts-comment": "error",
    },
  },
  // Indexer metadata boundary on the loan screens. `selectedReserve.token` is
  // symbol/name/decimals copied verbatim from the GraphQL indexer; the borrow
  // and repay surfaces must read `LoanContext.tokenIdentity` instead, which is
  // proven on-chain before the screen renders. Reading the indexer's copy here
  // is how a mislabelled asset or a wrong "Max" gets in front of a signature.
  {
    files: ["src/applications/aave/components/**/*.{ts,tsx}"],
    ignores: ["**/__tests__/**", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.object.name='selectedReserve'][object.property.name='token']",
          message:
            "Indexer-supplied metadata. Use LoanContext.tokenIdentity (proven on-chain) for the address, symbol, name and decimals.",
        },
      ],
    },
  },
  // Dev-only tooling boundary — production code must not import `src/dev` (the
  // god-mode / demo / debug tooling), so it stays an evident, self-contained
  // subtree that never leaks into the app except at the sanctioned mount seams
  // listed in `ignores`. Re-declares the @uidotdev/usehooks ban because a
  // file's `no-restricted-imports` is replaced wholesale, not merged.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/dev/**",
      "**/__tests__/**",
      "**/*.test.{ts,tsx}",
      // Sanctioned seams that legitimately mount / inject the dev tooling.
      // The single god-mode mount: the route layout that wraps Overview /
      // Vaults / Loans loads `dev/GodModeMount` behind `import.meta.env.DEV`.
      "src/router.tsx",
      "src/components/simple/DashboardPage.tsx",
      // v3 /vaults (#2041): mounts the god-mode panel, routes to the populated
      // layout under demo injection, and merges demo collateral / routes demo
      // stepper clicks — the same seams DashboardPage and
      // PendingDepositSection hold for v2.
      "src/components/pages/VaultsPage.tsx",
      "src/components/vaults/VaultsLifecycleSections.tsx",
      "src/hooks/useVaultsPageData.ts",
      // v3 /loans: merges demo loan rows into the Active Loans list, routes to
      // the populated layout under demo injection, and applies the god-mode
      // health-factor / borrow-capacity summary overrides. Mirrors VaultsPage.
      "src/components/pages/Loans.tsx",
      // v3 /activity: merges demo activity rows into the feed (display-only —
      // never polled, never written to the pending-activity storage).
      "src/hooks/useActivitiesWithPending.ts",
      "src/hooks/usePendingDeposits.ts",
      "src/context/deposit/PeginPollingContext.tsx",
      // God-mode simulated-activation walk: routes demo card clicks to the
      // multistepper and feeds the demo activity into it (the demo activation
      // content is loaded via a dev-gated dynamic import in the view).
      "src/components/simple/PendingDepositSection.tsx",
      "src/components/simple/PostDepositContinuationContent.tsx",
      // Artifact-download demo (god-mode-toggled fetch simulation) seams.
      "src/hooks/deposit/useArtifactDownload.ts",
      "src/components/simple/CollateralSection.tsx",
      // God-mode overrides for the notifications that are driven by live chain
      // reads rather than the cascade calculation, so they can be exercised
      // without the on-chain conditions. Each reads a store getter that is
      // compile-time `null` in production (gated on isGodModePanelEnabled).
      // RootLayout reads the protocol-status override so its banner-suppression
      // derivation matches ProtocolStatusBanner under a forced god-mode preview.
      "src/components/simple/MaxVaultsNotification.tsx",
      "src/components/shared/ProtocolStatusBanner.tsx",
      "src/components/pages/RootLayout.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          // Re-declares the bans from the base block: a file's
          // `no-restricted-imports` is replaced wholesale, not merged, so
          // omitting them here would silently un-ban them for this scope.
          paths: [USEHOOKS_BAN],
          patterns: [
            DEV_IMPORT_PATTERN_BAN,
            PEGIN_POLLING_PROVIDER_PATTERN_BAN,
          ],
        },
      ],
    },
  },
  // Single-polling-provider boundary, split by what each scope is exempt from.
  // Both blocks are placed last so they win over the blocks above, and both
  // re-declare the other bans for the same wholesale-replacement reason.
  //
  // The sanctioned mount may import `PeginPollingProvider` but is NOT exempt
  // from the src/dev ban — it is a production file, and dropping the dev ban
  // here would weaken the guardrail at exactly the file it protects.
  {
    files: ["src/context/deposit/AppPeginPollingProvider.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [USEHOOKS_BAN], patterns: [DEV_IMPORT_PATTERN_BAN] },
      ],
    },
  },
  // Tests mount the provider to exercise it in isolation, and are already
  // exempt from the src/dev ban via the dev block's `ignores`.
  {
    files: ["**/__tests__/**", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { paths: [USEHOOKS_BAN] }],
    },
  },
  {
    settings: {
      "import/resolver": {
        typescript: true,
      },
    },
  },
);
