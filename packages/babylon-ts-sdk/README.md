# @babylonlabs-io/ts-sdk

[![Build Status](https://github.com/babylonlabs-io/babylon-toolkit/workflows/Verify%20PR/badge.svg)](https://github.com/babylonlabs-io/babylon-toolkit/actions/workflows/verify.yml)
[![npm version](https://badge.fury.io/js/@babylonlabs-io%2Fts-sdk.svg)](https://www.npmjs.com/package/@babylonlabs-io/ts-sdk)

TypeScript SDK for Babylon protocol integrations

> **⚠️ Status**: Currently under active development.

## Overview

The Babylon TypeScript SDK provides a production-ready, framework-agnostic toolkit for building applications on top of the Babylon protocol.

### Key Features

- **🔐 Trustless Bitcoin Vaults (TBV)** - Core vault protocol operations
- **🏦 DeFi Integrations** - Pre-built integrations (Morpho and more)
- **📦 Framework Agnostic** - Works with React, Vue, Angular, Node.js, or vanilla JavaScript
- **🎯 Type-Safe** - Comprehensive TypeScript types with full IDE support
- **🧩 Modular Design** - Use only what you need via subpath exports
- **🔧 Extensible** - Easy to build custom integrations

## Installation

```bash
npm install @babylonlabs-io/ts-sdk viem
```

See [Installation Guide](./docs/get-started/installation.md) for detailed setup instructions.

## Package Structure

The SDK uses subpath exports for tree-shaking:

```typescript
// High-level managers (recommended for most users)
import {
  PeginManager,
  PayoutManager,
} from "@babylonlabs-io/ts-sdk/tbv/core";

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

// Protocol integrations
import { MorphoClient } from "@babylonlabs-io/ts-sdk/tbv/integrations/morpho";
import { AaveClient } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
```

## Trustless Bitcoin Vaults (TBV) Documentation

### 📚 Get Started

New to the SDK? Start here:

- **[Installation](./docs/get-started/installation.md)** - Install and verify the SDK

### 📖 Guides [⚠️WIP]

Complete flows and tutorials:

- **[Complete Peg-In Flow](./docs/guides/complete-pegin-flow.md)** - Deposit BTC into a Trustless Bitcoin Vault
- **[Complete Payout Flow](./docs/guides/complete-payout-flow.md)** - Withdraw BTC from the Trustless Bitcoin Vault
- **[Advanced: Using Primitives](./docs/guides/advanced-primitives.md)** - Low-level primitives for custom use cases
- **[Protocol Integrations](./docs/guides/integrations.md)** - For protocol developers

### 🔍 API Reference

Auto-generated from TSDoc comments using [TypeDoc](https://typedoc.org/):

- **[API Reference](./docs/api/README.md)** - Complete auto-generated API documentation

### 💡 Examples [⚠️WIP]

Working example applications:

- **[React App with Managers](./examples/managers-react/)** - Front-end implementation
- **[Node.js with Primitives](./examples/primitives-nodejs/)** - Back-end integration with custom signing

## Development

### Generating Documentation

API documentation is auto-generated from TSDoc comments using TypeDoc:

```bash
# Generate docs
pnpm docs:generate

# Clean and regenerate
pnpm docs:clean

# Validate docs without generating
pnpm docs:validate
```

> **Note**: The `docs/api/` directory contains auto-generated content. Do not edit these files directly. Instead, update TSDoc comments in the source code and regenerate.

## Links

- [GitHub Repository](https://github.com/babylonlabs-io/babylon-toolkit)
- [Issues](https://github.com/babylonlabs-io/babylon-toolkit/issues)
- [NPM Package](https://www.npmjs.com/package/@babylonlabs-io/ts-sdk)
