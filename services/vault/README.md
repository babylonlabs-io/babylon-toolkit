# Babylon Vault

The Babylon Vault is a web application for managing Bitcoin-collateralized lending positions. Users can deposit BTC as collateral and borrow stablecoins against it.

## Prerequisites

- Node.js at the version in the repository's `.nvmrc` (run `nvm use` at the repository root)
- pnpm through Corepack (`corepack enable`); the version is pinned in the root `package.json`

## Local Development

### 1. Install and build

From the repository root:

```bash
pnpm install
pnpm run build
```

The app imports the workspace packages (core-ui, ts-sdk, wallet-connector and the rest) from their built `dist/`, so build them before the first run and again after pulling changes to them.

### 2. Environment files

Create `.env` in the `services/vault` directory:

```bash
cp .env.example .env
```

`.env` holds the values that are the same on every network. Set the Reown project id there at minimum.

Put a network's own values in `.env.<network>.local`, for example `.env.testnet.local` or `.env.real-money-devnet.local`. Git ignores these files. `pnpm dev` passes the network name to Vite as its mode, so Vite reads these files, each overriding the one before:

1. `.env`
2. `.env.local`
3. `.env.<network>`
4. `.env.<network>.local`

A variable set in the shell overrides all of them. `pnpm dev:testnet` sets `NEXT_PUBLIC_TBV_DISABLED_BTC_WALLETS=onekey` that way, so a wallet list in `.env.testnet.local` has no effect under it; run `NEXT_PUBLIC_TBV_NETWORK=testnet pnpm dev` to use your own.

The network files apply to the dev server only. `pnpm build` runs Vite in production mode, which reads `.env`, `.env.local`, `.env.production` and `.env.production.local`, and `pnpm preview` serves what that build produced.

`.env` and `.env.local` apply to every network. A value that differs between networks, such as the Ethereum RPC, the utils API, the vault provider explorer or a feature flag, belongs in the network's file. To clear a value that `.env` sets, set it to empty in the network's file, for example `NEXT_PUBLIC_TBV_SIDECAR_API_URL=`.

This order holds when you start the server with pnpm, as in the table below. Nx (`pnpm exec nx dev @services/vault`, `nx dev:watchDeps`) loads `.env` and `.env.local` into the process environment before Vite starts, so through Nx they override the network's file the way a shell variable does. Keep network-specific values out of `.env` and `.env.local` and both ways of starting the server agree.

`pnpm dev` no longer reads `.env.development` or `.env.development.local`, because Vite's mode is now the network name. Move anything you kept there into `.env.<network>.local`.

Do not set `NEXT_PUBLIC_TBV_NETWORK` in any of these files. The dev server and the build refuse it there (see [Configuration](#configuration)).

### 3. Run the development server

From `services/vault`:

| Network           | Command                                              | Profile                           | Network env file               |
| ----------------- | ---------------------------------------------------- | --------------------------------- | ------------------------------ |
| devnet            | `pnpm dev`                                           | `networks/devnet.json`            | `.env.devnet.local`            |
| testnet           | `pnpm dev:testnet`                                   | `networks/testnet.json`           | `.env.testnet.local`           |
| real-money-devnet | `NEXT_PUBLIC_TBV_NETWORK=real-money-devnet pnpm dev` | `networks/real-money-devnet.json` | `.env.real-money-devnet.local` |
| any other profile | `NEXT_PUBLIC_TBV_NETWORK=<name> pnpm dev`            | `networks/<name>.json`            | `.env.<name>.local`            |

real-money-devnet runs on Bitcoin mainnet and Ethereum mainnet and moves real funds. `pnpm dev:testnet` also hides the OneKey wallet, as the testnet deployment does. From the repository root, `pnpm --filter @services/vault dev` is the same as `pnpm dev`.

Do not pass `--mode` yourself. Vite uses the last `--mode` it is given, so yours would replace the network name, and the dev server would read another network's env file.

Before starting Vite, `pnpm dev` compares the committed profile with tbv-networks. When they differ it prints `Run: pnpm sync-env <name>`; see [Configuration](#configuration).

The application will be available at `http://localhost:5173` (default Vite port).

## Configuration

The app is configured in two layers.

**1. A network profile** in `networks/<name>.json` holds everything that belongs to a
deployment: Bitcoin network, Ethereum chain, contract addresses, indexer and vault-provider
proxy endpoints, and a `kind` (`production`, `test` or `internal`) that decides which
Bitcoin and Ethereum networks may be paired. Profiles are generated from the private
`babylonlabs-io/tbv-networks` registry and committed, so every change is a reviewed diff.
The contract addresses include the Aave hubs (`aaveHub`, `aaveHubStables`): the app names
those hubs "Babylon Hub" and "Core Hub", and shows any other hub by its address, so a
redeploy needs only `pnpm sync-env <name>`.

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

See [Vault allowlists](../../docs/vault-allowlists.md) for how to limit the vault providers
offered and the wallets allowed to deposit.

The Ethereum RPC in use, the profile's `ethRpcUrl` or the `NEXT_PUBLIC_ETH_RPC_URL` override,
must serve `eth_simulateV1` with a gas allowance of at least 16,777,216: the activation checks
its gas limit with it before sending (`src/services/vault/activationGasLimit.ts`).
`https://ethereum-sepolia-rpc.publicnode.com` does; `https://rpc.sepolia.ethpandaops.io` does not.

The selector must not be set in a dotenv file: Nx loads `.env` into the build but keys its
cache on the process environment, so a selector found there is refused by the build and the
dev server. To pick the network locally, see [Run the development server](#3-run-the-development-server).

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
