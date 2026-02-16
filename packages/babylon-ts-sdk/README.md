# @babylonlabs-io/ts-sdk

[![Build Status](https://github.com/babylonlabs-io/babylon-toolkit/workflows/Verify%20PR/badge.svg)](https://github.com/babylonlabs-io/babylon-toolkit/actions/workflows/verify.yml)
[![npm version](https://badge.fury.io/js/@babylonlabs-io%2Fts-sdk.svg)](https://www.npmjs.com/package/@babylonlabs-io/ts-sdk)

TypeScript SDK for Trustless Bitcoin Vaults

> **⚠️ Status**: Currently under active development.

## Overview

The Babylon TypeScript SDK is a production-ready toolkit for integrating Trustless Bitcoin Vaults into your applications. Currently provides comprehensive support for Trustless Bitcoin Vaults (TBV) including vault management and supported application integrations.

## What Are Trustless Bitcoin Vaults?

Trustless Bitcoin Vaults (TBV) let you lock Bitcoin and use it in Ethereum applications (like DeFi lending) without giving up custody. The vault protocol enables:

- **Peg-in**: Lock BTC in a vault to use as collateral
- **Peg-out**: Unlock BTC from the vault back to your wallet
- **DeFi Integration**: Use vaulted BTC in protocols like Aave

This SDK handles the complex Bitcoin and Ethereum interactions needed to create and manage these vaults.

### Key Features

- **🔐 Vault Management** - Pegin, pegout, and vault lifecycle operations
- **🔌 Protocol Integrations** - Pre-built integrations starting with Aave (DeFi lending)
- **📦 Framework Agnostic** - Works with React, Vue, Angular, Node.js, or vanilla JavaScript
- **🎯 Type-Safe** - Comprehensive TypeScript types with full IDE support
- **🧩 Modular Design** - Use only what you need via subpath exports
- **🔧 Extensible** - Easy to build custom integrations

## Installation

### Requirements

- Node.js >= 24.0.0
- Package manager: npm, yarn, or pnpm

### Install

```bash
# npm
npm install @babylonlabs-io/ts-sdk viem

# yarn
yarn add @babylonlabs-io/ts-sdk viem

# pnpm
pnpm add @babylonlabs-io/ts-sdk viem
```

### Verify Installation

```typescript
import { buildPeginPsbt } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";

console.log("✅ SDK installed successfully!");
console.log("buildPeginPsbt type:", typeof buildPeginPsbt);
```

Run with: `npx tsx verify-install.ts`

> **Troubleshooting?** See [Troubleshooting Guide](./docs/get-started/troubleshooting.md) for Buffer polyfills, WASM setup, and bundler configuration.

## Package Structure

The SDK uses subpath exports for tree-shaking:

```typescript
// High-level managers (recommended for most users)
import { PeginManager, PayoutManager } from "@babylonlabs-io/ts-sdk/tbv/core";

// Low-level primitives (advanced use cases)
import {
  buildPeginPsbt,
  buildPayoutPsbt,
} from "@babylonlabs-io/ts-sdk/tbv/core/primitives";

// Utilities
import { selectUtxosForPegin } from "@babylonlabs-io/ts-sdk/tbv/core";

// Shared types and wallet interfaces
import { BitcoinWallet, UTXO } from "@babylonlabs-io/ts-sdk/shared";

// Contract ABIs
import { BTCVaultsManagerABI } from "@babylonlabs-io/ts-sdk/tbv/core";

// Protocol integrations (Aave)
import {
  buildAddCollateralTx,
  buildBorrowTx,
  getUserAccountData,
  calculateHealthFactor,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
```

## Choose Your API Level

The SDK provides two integration approaches:

### Managers (High-Level)

- **What**: Pre-built wallet orchestration for complete vault workflows
- **Best for**: Web apps, browser wallets (MetaMask, Unisat)
- **You provide**: Wallet interface
- **SDK handles**: Transaction building, signing coordination, contract calls

### Primitives (Low-Level, Advanced)

- **What**: Pure functions for building Bitcoin PSBTs
- **Best for**: Backend services, custom signing (KMS/HSM), full control
- **You provide**: Everything (signing logic, contract calls, broadcasting)
- **SDK handles**: Only PSBT construction and utility functions

## Trustless Bitcoin Vaults (TBV) Documentation

### 🚀 Quickstart

Step-by-step tutorials:

- **[Managers Quickstart](./docs/quickstart/managers.md)** - Create a Bitcoin vault with wallet integration (step-by-step)
- **[Primitives Quickstart](./docs/quickstart/primitives.md)** - Build vault PSBTs with custom signing logic (advanced)

### 🔌 Protocol Integrations

Use BTC vaults in DeFi protocols and applications:

- **Aave v4** - Use vaults as collateral to borrow assets
  - [Overview & API Reference](./docs/integrations/aave/README.md)
  - [Quickstart Guide](./docs/integrations/aave/quickstart.md)

### 🔍 API Reference

Auto-generated from TSDoc comments using [TypeDoc](https://typedoc.org/):

- **[API Reference](./docs/api/README.md)** - Complete auto-generated API documentation

### 🛠️ Troubleshooting

- **[Troubleshooting Guide](./docs/get-started/troubleshooting.md)** - Common issues and solutions

## Links

- [GitHub Repository](https://github.com/babylonlabs-io/babylon-toolkit)
- [Report an Issue](https://github.com/babylonlabs-io/babylon-toolkit/issues)
- [NPM Package](https://www.npmjs.com/package/@babylonlabs-io/ts-sdk)
- [Contributing Guide](./CONTRIBUTING.md)
