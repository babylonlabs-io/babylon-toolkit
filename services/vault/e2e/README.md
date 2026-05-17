# Vault E2E

Playwright suite for the vault dApp. The suite is **mock-first**: no
real Bitcoin regtest, no anvil, no live vault provider. Backend
responses are intercepted at the page-route layer with deterministic
payloads so tests stay fast and reproducible without provisioning
external services.

> This trade-off is deliberate. See issue #1589: full devnet harnessing
> blocks on the external contracts repo and a full VP implementation.
> Mock-first lets the per-flow tickets (#1590-#1602) land now and gives
> us coverage of the React surfaces, wallet wiring, and error paths.
> A future ticket can swap the route handlers for a real Anvil/bitcoind
> harness without rewriting the specs themselves.

## Layout

```
services/vault/e2e/
├── fixtures/
│   ├── mockBtcWallet.ts          Deterministic IBTCProvider
│   ├── mockEthWallet.ts          Deterministic viem WalletClient
│   ├── walletInjection.ts        window.__BABYLON_E2E_WALLETS__ bridge
│   ├── seededWallets.ts          Typed wrappers with declared balances
│   ├── networkRoutes.ts          page.route() helpers (mempool, VP, eth)
│   ├── test.ts                   Playwright test.extend with fixtures
│   └── index.ts                  Public barrel - tests import from here
├── pages/                        Page objects
│   ├── AppShell.ts
│   ├── Dashboard.ts
│   ├── DepositModal.ts
│   └── WithdrawModal.ts
└── *.spec.ts                     Specs
```

## Running tests

Playwright spins up the vault dev server itself (see
`playwright.config.ts` `webServer`). Tests intercept all network calls
via `page.route()`, so no separate backend is required.

```bash
pnpm --filter vault run test:e2e          # headless
pnpm --filter vault run test:e2e:headed   # with browser UI
pnpm --filter vault run test:e2e:ui       # Playwright UI mode
pnpm --filter vault run test:e2e:report   # open last HTML report
```

## Manual dev: standalone mock backends

Use this when you want to point a regular browser at the vault dApp
with deterministic backend responses (no Playwright).

```bash
pnpm --filter vault run e2e:env           # starts the four mock listeners
NEXT_PUBLIC_E2E_MODE=1 pnpm --filter vault run dev
```

The stubs (defined in `services/vault/scripts/e2e-env.mjs`) listen on
the same ports `playwright.config.ts` uses:

| Port | Purpose                              |
| ---: | ------------------------------------ |
| 9996 | mempool API (`/mempool/...`)          |
| 9997 | eth JSON-RPC (`POST /rpc`)            |
| 9998 | vault-provider proxy (`/vp-health`, `/rpc/{vp}`) |
| 9999 | GraphQL (`POST /graphql`)             |

The standalone stubs return generic defaults. Per-test customisation
goes through the route handlers in `networkRoutes.ts`, not the
standalone process.

## Writing a test

```ts
import {
  test,
  expect,
  mockMempoolForSeededBtcWallet,
  mockVpProxy,
} from "./fixtures";

test("dashboard reflects seeded BTC balance", async ({
  page,
  seededBtcWallet,
  installWallets,
  appShell,
  dashboard,
}) => {
  const wallet = seededBtcWallet({ amount: 250_000n });
  await mockMempoolForSeededBtcWallet(page, wallet);
  await mockVpProxy(page);
  await installWallets({ btc: wallet });

  await appShell.goto();
  await expect(dashboard.collateralSectionHeading).toBeVisible();
});
```

## Conventions

- **One fixture, one concern.** `seededBtcWallet` only describes the
  wallet; `mockMempoolForSeededBtcWallet` only wires its mempool
  responses. Compose them at the test site so each test reads top to
  bottom.
- **No magic defaults that hide failures.** A test that forgets to
  install a route handler should fail loud, not silently fall through
  to a default empty response. The route helpers prefer 501s over
  silent 200s for unhandled paths.
- **Selectors prefer role + accessible name.** Where role is not
  exposed, fall back to a stable `data-testid`. Adding new testids in
  source (kebab-case, feature-specific) is preferred over CSS
  selectors.
- **Each test starts clean.** Playwright tears down `page` between
  tests; route handlers and `window.__BABYLON_E2E_WALLETS__` reset
  automatically. Do not rely on prior test state.

## Override pattern

`page.route()` handlers register in order; the **last** matching
handler wins. Per-test overrides therefore go after fixture handlers:

```ts
await mockMempoolForSeededBtcWallet(page, wallet);   // default
await page.route("**/v1/fees/recommended", (route) =>  // override
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ fastestFee: 50, halfHourFee: 40, hourFee: 30, economyFee: 20, minimumFee: 10 }),
  }),
);
```

## CI

The suite runs under the standard playwright runner. CI parity is
trivial because there's nothing external to provision: GitHub Actions
runs `pnpm --filter vault run test:e2e` and the same in-test route
handlers fire. Sharding/parallelism lands with #1602.
