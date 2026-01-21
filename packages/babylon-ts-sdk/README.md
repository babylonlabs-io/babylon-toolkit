# @babylonlabs-io/ts-sdk

[![Build Status](https://github.com/babylonlabs-io/babylon-toolkit/workflows/Verify%20PR/badge.svg)](https://github.com/babylonlabs-io/babylon-toolkit/actions/workflows/verify.yml)
[![npm version](https://badge.fury.io/js/@babylonlabs-io%2Fts-sdk.svg)](https://www.npmjs.com/package/@babylonlabs-io/ts-sdk)

TypeScript SDK for Babylon protocol integrations

> **⚠️ Status**: Currently under active development.

## Overview

The Babylon TypeScript SDK provides a production-ready, framework-agnostic toolkit for building applications on top of the Babylon protocol.

### Key Features

- **🔐 Trustless Bitcoin Vaults (TBV)** - Core vault protocol operations
- **🏦 DeFi Integrations** - Pre-built integrations (`Aave` and others)
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

// Protocol integrations
import { AaveClient } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
```

## Trustless Bitcoin Vaults (TBV) Documentation

### 📚 Get Started

New to the SDK? Start here:

- **[Installation](./docs/get-started/installation.md)** - Install and verify the SDK

### 🚀 Quickstart

Step-by-step tutorials:

- **[Managers Quickstart](./docs/quickstart/managers.md)** - Complete peg-in flow with wallet integration
- **[Primitives Quickstart](./docs/quickstart/primitives.md)** - Low-level implementation guide

### 📖 Guides

Complete flows and tutorials:

- **[Using Managers](./docs/guides/managers.md)** - High-level orchestration for vault operations with wallet integration (recommended for most users)
- **[Using Primitives](./docs/guides/primitives.md)** - Low-level primitives for advanced use cases and custom implementations

### 🔍 API Reference

Auto-generated from TSDoc comments using [TypeDoc](https://typedoc.org/):

- **[API Reference](./docs/api/README.md)** - Complete auto-generated API documentation

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

