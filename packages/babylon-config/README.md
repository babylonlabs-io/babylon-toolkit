# @babylonlabs-io/config

Shared configuration package for Babylon Labs applications.

## Purpose

Centralized network configurations for ETH, BTC, and BBN chains used across all Babylon services and routes.

## Installation

```bash
npm install @babylonlabs-io/config
```

## Usage

### ETH Configuration

```typescript
import { getNetworkConfigETH, getETHChain, network } from '@babylonlabs-io/config';

// Get current network configuration
const config = getNetworkConfigETH();
console.log(config.chainId); // 1, 11155111, or 31337

// Get viem Chain object
const chain = getETHChain();

// Get current network name
console.log(network); // 'mainnet', 'testnet', or 'localhost'
```

### Environment Variables

- `NEXT_PUBLIC_NETWORK` - Network selection: `mainnet`, `testnet`, `localhost`, etc.
- `NEXT_PUBLIC_ETH_CHAIN_ID` - Override chain ID
- `NEXT_PUBLIC_ETH_RPC_URL` - Override RPC URL

## Supported Networks

### ETH
- **Mainnet** (chainId: 1)
- **Sepolia Testnet** (chainId: 11155111)
- **Localhost/Anvil** (chainId: 31337)

## Architecture

This package provides the base configuration that can be extended by services:

```
packages/babylon-config (base)
  └── services/simple-staking (extends with UI-specific properties like icons)
  └── routes/vault (uses base directly)
```

## Development

```bash
# Type check
npm run typecheck

# Lint
npm run lint
```
