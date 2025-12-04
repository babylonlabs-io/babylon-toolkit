# Babylon Vault SDK - Primitives

Pure functions for building Bitcoin transactions for Babylon vault operations.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Installation](#2-installation)
3. [Core Concepts](#3-core-concepts)
4. [Peg-in Flow](#4-peg-in-flow)
5. [Payout Signing Flow](#5-payout-signing-flow)
6. [API Reference](#6-api-reference)
7. [Utility Functions](#7-utility-functions)

---

## 1. Introduction

### What are Primitives?

Primitives are **pure functions** that handle the low-level Bitcoin transaction building for Babylon vault operations:

- No wallet dependencies
- No side effects
- Work in Node.js, browsers, and serverless environments

### When to Use Primitives

| Use Case | Recommended Layer |
|----------|-------------------|
| Backend services with custom signing (KMS, HSM) | **Primitives (Level 1)** |
| Serverless functions | **Primitives (Level 1)** |
| Full control over transaction flow | **Primitives (Level 1)** |
| Frontend apps with wallet integration | Managers (Level 2) |
| Quick integration with less code | Managers (Level 2) |

### Two-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Your Application                      │
└─────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│   Level 2: Managers │         │  Level 1: Primitives│
│                     │────────▶│   (Pure Functions)  │
└─────────────────────┘         └─────────────────────┘
                                          │
                                          ▼
                              ┌─────────────────────┐
                              │   WASM (Rust Core)  │
                              │   Source of Truth   │
                              └─────────────────────┘
```

**Level 1 (Primitives):** Pure functions that wrap WASM.

**Level 2 (Managers):** High-level orchestration with wallet integration. Uses Level 1 internally.

---

## 2. Installation

```bash
npm install @babylonlabs-io/ts-sdk
```

### Import Primitives

```typescript
import {
  buildPeginPsbt,
  buildPayoutPsbt,
  extractPayoutSignature,
  createPayoutScript,
} from '@babylonlabs-io/ts-sdk/tbv/core/primitives';

import {
  stripHexPrefix,
  toXOnly,
  processPublicKeyToXOnly,
  hexToUint8Array,
  uint8ArrayToHex,
  isValidHex,
} from '@babylonlabs-io/ts-sdk/tbv/core/primitives';

import type {
  PeginParams,
  PeginPsbtResult,
  PayoutParams,
  PayoutPsbtResult,
  PayoutScriptParams,
  PayoutScriptResult,
  Network,
} from '@babylonlabs-io/ts-sdk/tbv/core/primitives';
```

---

## 3. Core Concepts

### Data Flow

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Rust btc-vault  │ ──▶ │   WASM Package   │ ──▶ │  SDK Primitives  │
│ (Source of Truth)│     │ (JS/TS Bindings) │     │ (Clean TypeScript│
│                  │     │                  │     │       API)       │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

### Key Terminology

| Term | Description |
|------|-------------|
| **Depositor** | User depositing BTC into the vault |
| **Claimer** / **Vault Provider** | Entity that can claim funds from the vault |
| **Challengers** / **Liquidators** | Entities that can liquidate the vault |
| **Peg-in** | Depositing BTC into a vault |
| **Payout** | Withdrawing BTC from a vault (requires depositor signature) |
| **PSBT** | Partially Signed Bitcoin Transaction |
| **X-only Pubkey** | 32-byte public key format used in Taproot (no prefix byte) |

### Network Types

```typescript
type Network = 'bitcoin' | 'testnet' | 'regtest' | 'signet';
```

---

## 4. Peg-in Flow

See [pegin-flow.md](./pegin-flow.md) for the complete step-by-step guide.

**Quick example:**

```typescript
import { buildPeginPsbt } from '@babylonlabs-io/ts-sdk/tbv/core/primitives';

const result = await buildPeginPsbt({
  depositorPubkey: 'a1b2c3d4e5f6...',
  claimerPubkey: 'b2c3d4e5f6a1...',
  challengerPubkeys: ['c3d4e5f6a1b2...'],
  pegInAmount: 100000n,
  network: 'testnet',
});
```

---

## 5. Payout Signing Flow

See [payout-flow.md](./payout-flow.md) for the complete step-by-step guide.

**Quick example:**

```typescript
import { buildPayoutPsbt, extractPayoutSignature } from '@babylonlabs-io/ts-sdk/tbv/core/primitives';

const psbt = await buildPayoutPsbt({
  payoutTxHex: '0200000001...',
  peginTxHex: '0200000001...',
  claimTxHex: '0200000001...',
  depositorBtcPubkey: 'a1b2c3d4...',
  vaultProviderBtcPubkey: 'b2c3d4e5...',
  liquidatorBtcPubkeys: ['c3d4e5f6...'],
  network: 'testnet',
});

const signedPsbtHex = await wallet.signPsbt(psbt.psbtHex);
const signature = extractPayoutSignature(signedPsbtHex, 'a1b2c3d4...');
```

---

## 6. API Reference

### buildPeginPsbt()

Builds an unsigned peg-in transaction.

```typescript
async function buildPeginPsbt(params: PeginParams): Promise<PeginPsbtResult>
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `depositorPubkey` | `string` | Depositor's x-only public key (64 hex chars) |
| `claimerPubkey` | `string` | Vault provider's x-only public key |
| `challengerPubkeys` | `string[]` | Array of liquidator x-only public keys |
| `pegInAmount` | `bigint` | Amount to deposit in satoshis |
| `network` | `Network` | Bitcoin network |

#### Returns

| Property | Type | Description |
|----------|------|-------------|
| `psbtHex` | `string` | Unsigned transaction hex (unfunded, no inputs) |
| `txid` | `string` | Transaction ID (changes after adding inputs) |
| `vaultScriptPubKey` | `string` | Vault output script pubkey (hex) |
| `vaultValue` | `bigint` | Vault output value in satoshis |

---

### buildPayoutPsbt()

Builds an unsigned payout PSBT for depositor signing.

```typescript
async function buildPayoutPsbt(params: PayoutParams): Promise<PayoutPsbtResult>
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `payoutTxHex` | `string` | Unsigned payout transaction hex from vault provider |
| `peginTxHex` | `string` | Original peg-in transaction hex |
| `claimTxHex` | `string` | Claim transaction hex from vault provider |
| `depositorBtcPubkey` | `string` | Depositor's x-only public key |
| `vaultProviderBtcPubkey` | `string` | Vault provider's x-only public key |
| `liquidatorBtcPubkeys` | `string[]` | Array of liquidator x-only public keys |
| `network` | `Network` | Bitcoin network |

#### Returns

| Property | Type | Description |
|----------|------|-------------|
| `psbtHex` | `string` | Unsigned PSBT hex ready for signing |

---

### extractPayoutSignature()

Extracts the 64-byte Schnorr signature from a signed payout PSBT.

```typescript
function extractPayoutSignature(signedPsbtHex: string, depositorPubkey: string): string
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `signedPsbtHex` | `string` | Signed PSBT hex |
| `depositorPubkey` | `string` | Depositor's x-only public key |

#### Returns

`string` - 64-byte Schnorr signature as 128 hex characters

---

### createPayoutScript()

Creates the payout script and taproot information.

```typescript
async function createPayoutScript(params: PayoutScriptParams): Promise<PayoutScriptResult>
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `depositor` | `string` | Depositor's x-only public key |
| `vaultProvider` | `string` | Vault provider's x-only public key |
| `liquidators` | `string[]` | Array of liquidator x-only public keys |
| `network` | `Network` | Bitcoin network |

#### Returns

| Property | Type | Description |
|----------|------|-------------|
| `payoutScript` | `string` | Full payout script (hex) |
| `taprootScriptHash` | `string` | Taproot script hash |
| `scriptPubKey` | `string` | Output script pubkey (hex) |
| `address` | `string` | P2TR Bitcoin address |

---

## 7. Utility Functions

### stripHexPrefix()

Removes the `0x` prefix from a hex string if present.

```typescript
function stripHexPrefix(hex: string): string

stripHexPrefix('0xabc123')  // 'abc123'
stripHexPrefix('abc123')    // 'abc123'
```

---

### toXOnly()

Converts a 33-byte compressed public key to 32-byte x-only format.

```typescript
function toXOnly(pubKey: Uint8Array): Uint8Array

const compressed = hexToUint8Array('02a1b2c3d4...');
const xOnly = toXOnly(compressed);
```

---

### processPublicKeyToXOnly()

Processes any public key format to x-only hex string.

```typescript
function processPublicKeyToXOnly(publicKeyHex: string): string

processPublicKeyToXOnly('a1b2c3d4...')      // 64 chars - unchanged
processPublicKeyToXOnly('02a1b2c3d4...')    // 66 chars - removes prefix
processPublicKeyToXOnly('0x02a1b2c3d4...')  // strips 0x first
```

Supported formats: 64 hex chars (x-only), 66 hex chars (compressed), 130 hex chars (uncompressed)

---

### hexToUint8Array()

Converts a hex string to Uint8Array.

```typescript
function hexToUint8Array(hex: string): Uint8Array

hexToUint8Array('abc123')    // Uint8Array [0xab, 0xc1, 0x23]
hexToUint8Array('0xabc123')  // Uint8Array [0xab, 0xc1, 0x23]
```

---

### uint8ArrayToHex()

Converts a Uint8Array to hex string.

```typescript
function uint8ArrayToHex(bytes: Uint8Array): string

uint8ArrayToHex(new Uint8Array([0xab, 0xc1, 0x23]))  // 'abc123'
```

---

### isValidHex()

Validates that a string is valid hexadecimal.

```typescript
function isValidHex(hex: string): boolean

isValidHex('abc123')    // true
isValidHex('0xabc123')  // true
isValidHex('xyz')       // false
isValidHex('abc')       // false (odd length)
```

---


