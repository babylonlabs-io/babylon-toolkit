# Babylon Vault

The Babylon Vault is a web application for managing Bitcoin-collateralized lending positions. Users can deposit BTC as collateral and borrow stablecoins against it.

## Prerequisites

- Node.js (v18 or higher)
- pnpm (v8 or higher)

## Local Development

### 1. Install Dependencies

From the repository root:

```bash
pnpm install
```

### 2. Environment Setup

Create a `.env` file in the `services/vault` directory:

```bash
cp .env.example .env
```

Edit `.env` for your overrides (Reown project id at minimum; see [Configuration](#configuration) below). The network profile defaults to `devnet`.

### 3. Run Development Server

From the repository root:

```bash
pnpm --filter @services/vault dev
```

Or from the `services/vault` directory:

```bash
pnpm dev
```

The application will be available at `http://localhost:5173` (default Vite port).

## Configuration

The app is configured in two layers.

**1. A network profile** in `networks/<name>.json` holds everything that belongs to a
deployment: Bitcoin network, Ethereum chain, contract addresses, indexer and vault-provider
proxy endpoints, and a `kind` (`production`, `test` or `internal`) that decides which
Bitcoin and Ethereum networks may be paired. Profiles are generated from the private
`babylonlabs-io/tbv-networks` registry and committed, so every change is a reviewed diff.

```bash
pnpm sync-env devnet                  # refresh one profile from the registry
pnpm sync-env --all                   # refresh every registry-backed profile
pnpm sync-env:check                   # exit 1 if any committed profile is stale
pnpm sync-env <name> --kind test      # add a profile for a new registry entry
```

A profile may carry an `overrides` block for its three endpoints while the registry entry
is wrong; each override states a reason and `sync-env` keeps it across regenerations.
`e2e-replay.json` is hand-written (`registryCommit: null`) and backs the Playwright suite.

**2. Build variables**, `NEXT_PUBLIC_*`, select the profile and hold per-deployment
overrides. Every name the app reads is listed with its class in `env-manifest.json`;
`pnpm check:env-manifest` fails when source, the release workflow and that list disagree.

| Variable                                                                                                                                   | Class      | Meaning                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_TBV_NETWORK`                                                                                                                  | required   | Profile name. Unset locally means `devnet`; CI builds must set it. An unknown name fails the build. |
| `NEXT_PUBLIC_REOWN_PROJECT_ID`                                                                                                             | required   | Reown (WalletConnect) project id.                                                                   |
| `NEXT_PUBLIC_ETH_RPC_URL`                                                                                                                  | optional   | Overrides the profile's RPC.                                                                        |
| `NEXT_PUBLIC_MEMPOOL_API`                                                                                                                  | optional   | Mempool host (no `/signet`, no `/api`). Default `https://mempool.space`.                            |
| `NEXT_PUBLIC_TBV_UTILS_API`, `NEXT_PUBLIC_TBV_SIDECAR_API_URL`, `NEXT_PUBLIC_TBV_VP_EXPLORER_URL`, `NEXT_PUBLIC_TBV_ORDINALS_API_URL`      | optional   | Auxiliary services; each feature degrades when unset.                                               |
| `NEXT_PUBLIC_NOTICE_BANNER_MESSAGE`, `NEXT_PUBLIC_TBV_DISABLED_BTC_WALLETS`, `NEXT_PUBLIC_TBV_ALLOWED_VAULT_PROVIDERS`, `NEXT_PUBLIC_FF_*` | optional   | Operator switches; see `src/config/featureFlags.ts`.                                                |
| `NEXT_PUBLIC_CANONICAL`, `NEXT_PUBLIC_COMMIT_HASH`, Sentry variables                                                                       | build-only | Set by the release workflow.                                                                        |

The Ethereum RPC in use, the profile's `ethRpcUrl` or the `NEXT_PUBLIC_ETH_RPC_URL` override,
must serve `eth_simulateV1` with a gas allowance of at least 16,777,216: the activation checks
its gas limit with it before sending (`src/services/vault/activationGasLimit.ts`).
`https://ethereum-sepolia-rpc.publicnode.com` does; `https://rpc.sepolia.ethpandaops.io` does not.

Local development: `pnpm dev` runs devnet; `pnpm dev:testnet` runs the `testnet`
profile. Run `NEXT_PUBLIC_TBV_NETWORK=<name> pnpm dev` to pick another. The selector must
not be set in a dotenv file: Nx loads `.env` into the build but keys its cache on the process
environment, so a selector found there is refused by the build and the dev server.

## Available Scripts

### Development

- `pnpm dev` - Start development server
- `pnpm watchDeps` - Watch and rebuild dependencies

### Building

- `pnpm build` - Build for production
- `pnpm preview` - Preview production build locally

### Code Quality

- `pnpm lint` - Run ESLint
- `pnpm format` - Check code formatting
- `pnpm format:fix` - Fix code formatting
- `pnpm sort-imports` - Sort imports

### Other

- `pnpm clean` - Remove node_modules

## Deployment

`.github/workflows/service-release-vault.yml` builds one bundle per GitHub Environment. Each
matrix entry names its profile and expected kind; the workflow checks the profile before the
build, passes `NEXT_PUBLIC_TBV_NETWORK` from the matrix, and checks the built bundle inlined
that profile and no other. GitHub Environments hold only the override variables.

To add an environment:

1. Add `<name>/network_info.json` to `babylonlabs-io/tbv-networks` (or confirm it exists).
2. `pnpm sync-env <name> --kind test|internal|production`, review `networks/<name>.json`,
   add an `overrides` block only if the registry entry is wrong, and open a PR.
3. Create the GitHub Environment with the override variables it needs (`NEXT_PUBLIC_REOWN_PROJECT_ID`,
   Sentry, `NEXT_PUBLIC_CANONICAL`, flags). Never add a contract address or endpoint there.
4. Add a matrix entry to `service-release-vault.yml` with `"network":"<name>"` and
   `"expected_kind":"<kind>"`, plus the AWS account and, for a main-only environment, its role.

## Troubleshooting

### Port already in use

If port 5173 is already in use, you can specify a different port:

```bash
pnpm dev -- --port 3001
```

### Build memory issues

The build uses increased memory allocation. If you encounter memory issues, adjust `NODE_OPTIONS`:

```bash
NODE_OPTIONS=--max-old-space-size=16384 pnpm build
```
