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

Edit the `.env` file with the required environment variables (see [Environment Variables](#environment-variables) below).

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

## Environment Variables

Create a `.env` file with the following variables:

### Required

- `NEXT_PUBLIC_API_URL` - Back-end API URL for vault system queries
  - Example: `https://staking-api.testnet.babylonlabs.io`
- `NEXT_PUBLIC_NETWORK` - BTC network environment (`mainnet`, `testnet`, `signet`)
  - Example: `testnet`
- `NEXT_PUBLIC_FF_VAULT` - Feature flag to enable vault functionality
  - Set to `true` to enable the vault UI

### Optional

- `NEXT_PUBLIC_MEMPOOL_API` - Mempool.space host for Bitcoin node queries
  - Default: `https://mempool.space`
- `NEXT_PUBLIC_COMMIT_HASH` - Git commit hash (usually injected during CI)
- `NEXT_PUBLIC_CANONICAL` - Canonical URL for the application

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

## Deposit Flow Implementation

### Architecture

The vault implements a complete BTC peg-in deposit flow:

1. **Wallet Connection**: BTC and Ethereum wallets via `@babylonlabs-io/wallet-connector`
2. **Provider Selection**: Real-time vault provider data from API
3. **Transaction Building**: BTC peg-in with fee estimation using mempool API
4. **Signing & Submission**: Dual-chain transaction (BTC + EVM)
5. **Status Tracking**: Persistent storage with lifecycle management

### Key Components

- **`hooks/useDepositFlow.ts`**: Core orchestration of deposit flow
- **`hooks/useVaultProviders.ts`**: Vault provider API integration
- **`hooks/useUTXOs.ts`**: Real-time BTC balance and UTXO fetching
- **`state/usePeginStorage.ts`**: Persistent pegin tracking in localStorage
- **`utils/fee/peginFee.ts`**: Fee estimation (from PR #469)

### Flow Steps

```typescript
// 1. User connects wallets and enters amount
// 2. Fetch UTXOs and calculate fee
const fee = estimatePeginFee(amountSats, utxos, feeRate);

// 3. Build and sign BTC transaction (WASM)
const btcTxHex = await buildPeginTransaction(...);

// 4. Submit to EVM vault contract
const ethTxHash = await vaultContract.deposit(...);

// 5. Persist pending deposit
addPendingPegin({ btcTxid, ethTxHash, status: PeginStatus.PENDING_VERIFICATION });
```

See [MIGRATION_SUMMARY.md](./MIGRATION_SUMMARY.md) for detailed implementation notes.

## Deployment

The application is built using Vite and can be deployed to any static hosting service:

```bash
pnpm build
# Output will be in dist/
```

Deployment is automated via GitHub Actions to S3 for multiple environments:
- `vault-devnet`
- `testnet`  
- `mainnet`

See `.github/workflows/service-release-vault.yml`

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
