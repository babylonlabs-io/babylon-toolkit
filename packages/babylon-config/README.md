# @babylonlabs-io/config

Shared network configuration for Babylon Labs applications.

## Purpose

Centralized ETH and BTC network configuration. The package itself reads no
environment variables — the host application validates its own env and
passes values in via `configureBabylonConfig`.

## Usage

### Initialize once at startup

```typescript
import { configureBabylonConfig } from "@babylonlabs-io/config";

configureBabylonConfig({
  ethChainId: 11155111,         // 1 (mainnet) or 11155111 (sepolia)
  ethRpcUrl: "https://...",     // RPC that can see your deployed contracts
  btcNetwork: "signet",         // "mainnet" or "signet"
  mempoolApiUrl: "https://...", // optional, default https://mempool.space
});
```

The host application is responsible for plumbing its env vars into this call.
Calling any reader before `configureBabylonConfig` throws.

### Read configuration

```typescript
import {
  getETHChain,
  getNetworkConfigETH,
  getNetworkConfigBTC,
  getBTCNetwork,
} from "@babylonlabs-io/config";

const chain = getETHChain();           // viem Chain with rpcUrls pinned
const ethConfig = getNetworkConfigETH();
const btcConfig = getNetworkConfigBTC();
const btcNet = getBTCNetwork();
```

## Supported Networks

| ETH chainId | BTC network |
| --- | --- |
| 1 (mainnet) | mainnet |
| 11155111 (sepolia) | signet |

Other pairings are rejected at init time.

## Why no `process.env` access?

Reading `process.env` from a library couples it to a specific host (Next.js),
makes it unimportable in tests without env stubbing, and runs side effects on
import. Explicit init keeps the library host-agnostic and pushes env validation
to the layer that actually owns those variables.

## Development

```bash
# Type check
pnpm run typecheck
```
