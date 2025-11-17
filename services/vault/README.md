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

- `NEXT_PUBLIC_BTC_NETWORK` - Bitcoin network (must be `mainnet` or `signet`)
  - Use `signet` for devnet/testnet
  - Use `mainnet` for production
  - Example: `signet`
- `NEXT_PUBLIC_ETH_CHAINID` - Ethereum chain ID (must be `1` or `11155111`)
  - Use `11155111` (Sepolia) for devnet/testnet
  - Use `1` (Ethereum Mainnet) for production
  - Example: `11155111`
- `NEXT_PUBLIC_VAULT_PROVIDER_RPC_URL` - Vault provider RPC endpoint
  - Example: `https://btc-vault-api.vault-devnet.babylonlabs.io`
- `NEXT_PUBLIC_VAULT_API_URL` - Vault indexer API endpoint
  - Example: `https://vault-indexer-api.vault-devnet.babylonlabs.io`
- `NEXT_PUBLIC_TBV_BTC_VAULTS_MANAGER` - TBV BTC Vaults Manager contract address
- `NEXT_PUBLIC_TBV_MORPHO_CONTROLLER` - TBV Morpho Integration Controller contract address
- `NEXT_PUBLIC_TBV_BTC_VAULT` - TBV BTC Vault contract address
- `NEXT_PUBLIC_TBV_MORPHO` - TBV Morpho contract address

### Optional

- `NEXT_PUBLIC_MEMPOOL_API` - Mempool.space host for Bitcoin node queries
  - Default: `https://mempool.space` (mainnet) or `https://mempool.space/signet` (signet)
- `NEXT_PUBLIC_ETH_RPC_URL` - Custom Ethereum RPC URL
  - Default: `https://cloudflare-eth.com` (mainnet) or `https://rpc.sepolia.org` (sepolia)
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

## Deployment

The application is built using Vite and can be deployed to any static hosting service:

```bash
pnpm build
# Output will be in dist/
```

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
