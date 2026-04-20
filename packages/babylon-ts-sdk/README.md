# @babylonlabs-io/ts-sdk

[![Build Status](https://github.com/babylonlabs-io/babylon-toolkit/workflows/Verify%20PR/badge.svg)](https://github.com/babylonlabs-io/babylon-toolkit/actions/workflows/verify.yml)
[![npm version](https://badge.fury.io/js/@babylonlabs-io%2Fts-sdk.svg)](https://www.npmjs.com/package/@babylonlabs-io/ts-sdk)

TypeScript SDK for Trustless Bitcoin Vaults

> **⚠️ Status**: Currently under active development.

## Overview

The Babylon TypeScript SDK is a production-ready toolkit for integrating Trustless Bitcoin Vaults into your applications. Currently provides comprehensive support for Trustless Bitcoin Vaults (TBV) including vault management and supported application integrations.

## What Are Trustless Bitcoin Vaults?

Trustless Bitcoin Vaults (TBV) let you lock Bitcoin and use it in applications on supported chains (like lending protocols) without giving up custody. The vault protocol enables:

- **Peg-in**: Lock BTC in a vault on Bitcoin to use as collateral ([protocol spec](https://github.com/babylonlabs-io/btc-vault/blob/main/docs/pegin.md))
- **Peg-out**: Unlock BTC from the vault back to your wallet ([protocol spec](https://github.com/babylonlabs-io/btc-vault/blob/main/docs/pegout.md))
- **DeFi Integration**: Use vaulted BTC in protocols like Aave

This SDK handles the complex Bitcoin and Ethereum interactions needed to create and manage these vaults.

### Key Features

- **🔐 Vault Management** - Vault creation (Pegin), vault redemption (Pegout), and vault lifecycle operations
- **🔌 Application Integrations** - Pre-built integrations starting with Aave (DeFi lending)
- **📦 Framework Agnostic** - Works with React, Vue, Angular, Node.js, or vanilla JavaScript
- **🎯 Type-Safe** - Comprehensive TypeScript types with full IDE support
- **🧩 Modular Design** - Use only what you need via subpath exports
- **🔧 Extensible** - Easy to build custom integrations

## Platforms

This SDK runs on **both Node.js backends and browser/React frontends** — the
entire library is framework-agnostic. The *only* difference between the two
environments is how you supply two things: a Bitcoin wallet and an Ethereum
wallet. The SDK provides interfaces (`BitcoinWallet`, viem's `WalletClient`)
and you adapt whichever wallet is available on your platform.

| Concern | Node.js backend | Browser / React |
|---------|-----------------|-----------------|
| `BitcoinWallet` | Build from a seed via `bitcoinjs-lib` + `bip32` (or call KMS/HSM) | Adapt an injected wallet (Unisat, OKX, Xverse, Leather) |
| viem `WalletClient` | `createWalletClient({ account: privateKeyToAccount(pk), chain, transport: http(RPC_URL) })` | `createWalletClient({ account, chain, transport: custom(window.ethereum) })` via wagmi |
| Secret storage | Your DB / KMS (required for activation later) | Session/local storage or user-supplied |
| WASM loading | Automatic (SDK reads `.wasm` off disk with `node:fs`) | Automatic (SDK fetches `.wasm` via bundler) |

If you're using a bundler (Vite, webpack, Next.js), ensure it's configured to
handle `.wasm` assets and that `Buffer` is available on the global in browser
targets — see the [Troubleshooting Guide](./docs/get-started/troubleshooting.md).

## Installation

### Requirements

- **Node.js ≥ 20.3.0** (for `AbortSignal.any()`). Works on Node 20 LTS, 22 LTS, 24 LTS.
- Package manager: npm, yarn, or pnpm

### Install

```bash
# npm
npm install @babylonlabs-io/ts-sdk viem bitcoinjs-lib @bitcoin-js/tiny-secp256k1-asmjs

# yarn
yarn add @babylonlabs-io/ts-sdk viem bitcoinjs-lib @bitcoin-js/tiny-secp256k1-asmjs

# pnpm
pnpm add @babylonlabs-io/ts-sdk viem bitcoinjs-lib @bitcoin-js/tiny-secp256k1-asmjs
```

### ECC Library Initialization (required, once at startup)

The SDK uses `bitcoinjs-lib` for Taproot operations. Call `initEccLib()` once
at application startup **before any SDK call that builds a PSBT or derives a
Bitcoin address**:

```typescript
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib } from "bitcoinjs-lib";

initEccLib(ecc);
```

- **Node.js**: call this at the top of your entry point (`index.ts` / CLI entry).
- **React**: call it in `main.tsx` / `app.tsx` before `createRoot()`.

Failing to initialize produces a runtime error: `"No ECC Library provided"`.

The WASM package used internally (`@babylonlabs-io/babylon-tbv-rust-wasm`)
initializes itself lazily — no extra call needed.

### Verify Installation

```typescript
import { buildPrePeginPsbt } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";

console.log("✅ SDK installed successfully!");
console.log("buildPrePeginPsbt type:", typeof buildPrePeginPsbt);
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
  buildPrePeginPsbt,
  buildPeginTxFromFundedPrePegin,
  buildPayoutPsbt,
  buildDepositorPayoutPsbt,
  buildNoPayoutPsbt,
  buildChallengeAssertPsbt,
  buildRefundPsbt,
  formatSatoshisToBtc,
} from "@babylonlabs-io/ts-sdk/tbv/core/primitives";

// Services (activation, deposit validation, protocol state)
import {
  activateVault,
  getPeginProtocolState,
  ContractStatus,
  validateDepositAmount,
  isPegoutTerminalStatus,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";

// Utilities
import {
  selectUtxosForPegin,
  collectReservedUtxoRefs,
  validateUtxosAvailable,
} from "@babylonlabs-io/ts-sdk/tbv/core";

// Shared wallet interfaces
import { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
// UTXO type lives in the core utils module
import { UTXO } from "@babylonlabs-io/ts-sdk/tbv/core";

// Contract ABIs
import { BTCVaultRegistryABI } from "@babylonlabs-io/ts-sdk/tbv/core";

// Protocol integrations (Aave)
import {
  buildBorrowTx,
  buildRepayTx,
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

### 🔌 Application Integrations

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
