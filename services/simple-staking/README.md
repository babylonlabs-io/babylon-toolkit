# Bitcoin Staking dApp

The Bitcoin Staking dApp is a web application integrating with extension wallets that allows users to stake their Bitcoin. It is hosted by Babylon and serves as a reference implementation for entities that want to set up their own staking website.

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

Create a `.env` file in the `services/simple-staking` directory:

```bash
cp .env.example .env
```

Edit the `.env` file with the required environment variables (see [Environment Variables](#environment-variables) below).

### 3. Run Development Server

From the repository root:

```bash
pnpm --filter @services/simple-staking dev
```

Or from the `services/simple-staking` directory:

```bash
pnpm dev
```

The application will be available at `http://localhost:5173` (default Vite port).

## Environment Variables

Create a `.env` file with the following variables:

### Required

- `NEXT_PUBLIC_API_URL` - Back-end API URL for staking system queries
  - Example: `https://staking-api.testnet.babylonlabs.io`
- `NEXT_PUBLIC_NETWORK` - BTC network environment (`mainnet`, `testnet`, `signet`)
  - Example: `testnet`

### Optional

- `NEXT_PUBLIC_MEMPOOL_API` - Mempool.space host for Bitcoin node queries
  - Default: `https://mempool.space`
- `NEXT_PUBLIC_DISPLAY_TESTING_MESSAGES` - Show testing network related messages
  - Default: `true`
- `NEXT_PUBLIC_FIXED_STAKING_TERM` - Whether staking term is fixed
  - Default: `false`
- `NEXT_PUBLIC_STAKING_DISABLED` - Disable staking on the dashboard
  - Default: `false`
- `NEXT_PUBLIC_BBN_GAS_PRICE` - Gas price for BABY transactions
  - Default: `0.002`
- `NEXT_PUBLIC_BABY_RPC_URL` - RPC URL override for Babylon network
  - Example: `https://babylon-testnet-rpc.nodes.guru/`
- `NEXT_PUBLIC_BABY_LCD_URL` - LCD URL override for Babylon network
  - Example: `https://babylon-testnet-api.nodes.guru/`
- `NEXT_PUBLIC_BABYLON_EXPLORER` - Babylon block explorer URL
  - Example: `https://testnet.babylon.explorers.guru`
- `NEXT_PUBLIC_ETH_RPC_URL` - Ethereum RPC URL override
- `NEXT_PUBLIC_REOWN_PROJECT_ID` - Reown (WalletConnect) project ID for wallet integration
- `NEXT_PUBLIC_SIDECAR_API_URL` - Sidecar API service base URL
- `NEXT_PUBLIC_COMMIT_HASH` - Git commit hash (usually injected during CI)
- `NEXT_PUBLIC_CANONICAL` - Canonical URL for the application
- `NEXT_PUBLIC_REPLAYS_RATE` - Sentry Session Replays sample rate (0.0 to 1.0)
- `NEXT_PUBLIC_REDACT_TELEMETRY` - Redact wallet addresses/public keys in telemetry logs
  - Default: `true` (recommended for privacy)
  - Set to `false` only for local debugging to see full identifiers in Sentry

### Sentry Configuration (Optional)

- `NEXT_PUBLIC_SENTRY_DSN` - Sentry DSN for error reporting
- `SENTRY_ORG` - Sentry organization slug (for source map uploads)
- `SENTRY_PROJECT` - Sentry project slug (for source map uploads)
- `SENTRY_URL` - Self-hosted Sentry instance URL

## Available Scripts

### Development

- `pnpm dev` - Start development server
- `pnpm watchDeps` - Watch and rebuild dependencies

### Building

- `pnpm build` - Build for production
- `pnpm preview` - Preview production build locally
- `pnpm build-docker` - Build Docker image

### Code Quality

- `pnpm lint` - Run ESLint
- `pnpm format` - Check code formatting
- `pnpm format:fix` - Fix code formatting
- `pnpm sort-imports` - Sort imports

### Testing

- `pnpm test` - Run unit tests
- `pnpm test:watch` - Run unit tests in watch mode
- `pnpm test:e2e` - Run E2E tests
- `pnpm test:e2e:ui` - Run E2E tests with UI
- `pnpm test:e2e:headed` - Run E2E tests in headed mode
- `pnpm test:e2e:report` - Show E2E test report
- `pnpm build:e2e` - Build for E2E testing

### Other

- `pnpm clean` - Remove node_modules
- `pnpm visualizer` - Visualize bundle size

## Wallet Integration

Instructions for wallet integration can be found in the [babylon-wallet-connector package](../../packages/babylon-wallet-connector/README.md).

## E2E Tests

The E2E tests use environment variables from `.env.test` and are located in the `e2e/specs` directory.

To run E2E tests:

1. Build the application for testing:

   ```bash
   pnpm build:e2e
   ```

2. Run the tests:
   ```bash
   pnpm test:e2e
   ```

## Deployment

The application is built using Vite and can be deployed to any static hosting service:

```bash
pnpm build
# Output will be in dist/
```

For Docker deployment:

```bash
pnpm build-docker
```

## Troubleshooting

### Port already in use

If port 5173 is already in use, you can specify a different port:

```bash
pnpm dev -- --port 3000
```

### Build memory issues

The build uses increased memory allocation. If you encounter memory issues, adjust `NODE_OPTIONS`:

```bash
NODE_OPTIONS=--max-old-space-size=16384 pnpm build
```
