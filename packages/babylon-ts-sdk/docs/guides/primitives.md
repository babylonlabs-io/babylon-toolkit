# Babylon TBV TypeScript SDK - Primitives

Pure functions for building Bitcoin transactions for Babylon Trustless BTC Vault (TBV).

---

## ⚠️ Important: Primitives vs Managers

## Understanding the SDK Layers

The SDK provides three levels of abstraction:

### Level 1: Primitives (Pure Functions)

**What Primitives Provide:**

- ✅ Pure Bitcoin transaction builders (`buildPeginPsbt`, `buildPayoutPsbt`)
- ✅ Signature extraction (`extractPayoutSignature`)
- ✅ Bitcoin utility functions (pubkey conversion, hex helpers)

**What Primitives Don't Provide:**

- ❌ Wallet integration or signing
- ❌ Ethereum contract interaction
- ❌ Proof-of-Possession (PoP) generation
- ❌ Vault provider RPC polling or submission
- ❌ Transaction broadcasting
- ❌ Any orchestration or coordination logic

### Level 2: Utils (Helper Functions)

**What Utils Provide:**

- ✅ **UTXO Selection** - `selectUtxosForPegin()` with iterative fee calculation
- ✅ **Fee Calculation Constants** - `P2TR_INPUT_SIZE`, `BTC_DUST_SAT`, `rateBasedTxBufferFee()`
- ✅ **Transaction Helpers** - Funding, change calculation, script parsing

```typescript
import {
  selectUtxosForPegin,
  P2TR_INPUT_SIZE,
  BTC_DUST_SAT,
  rateBasedTxBufferFee,
} from "@babylonlabs-io/ts-sdk/tbv/core";
```

### What You Must Still Implement:

- Wallet integration for signing (both BTC and ETH)
- Ethereum contract interaction (`viem`)
- BIP-322 PoP signature generation
- Vault provider RPC polling and signature submission
- Transaction broadcasting to Bitcoin network
- State management and error handling

**For automated orchestration of the complete 4-step flow**, use the [Managers Guide](./managers.md).

### When to Use Primitives

Use primitives for **custom implementations** when you need:

- Backend services with custom signing (KMS/HSM)
- Full control over every operation
- Custom wallet integrations
- Serverless environments with specific requirements

### Level 3: Managers (Full Orchestration)

**For complete peg-in orchestration**, use the [Managers Guide](./managers.md):

- ✅ Handles proof-of-possession (PoP) automatically
- ✅ Handles Ethereum contract submission
- ✅ Handles payout authorization flow (Step 3)
- ✅ Integrates with browser wallets
- ✅ Uses utils layer for UTXO selection and fee calculation
- ✅ Uses primitives layer for PSBT building
- ✅ Broadcasts to Bitcoin network

---

This guide shows how to use primitives for **Bitcoin transaction building**. You must implement PoP, Ethereum interactions, and payout orchestration yourself.

> **🚀 Quick Start**: For a complete working example with all 4 steps, see the [Primitives Quickstart Guide](../quickstart/primitives.md).

## Installation

```bash
npm install @babylonlabs-io/ts-sdk
```

## Architecture Layers

```
Your Application
      ↓
┌───────────────────────────────────┐
│ Level 3: Managers                 │
│ - PeginManager, PayoutManager     │
│ - Handles PoP, Ethereum, RPC      │
│ - Wallet orchestration            │
└───────────────────────────────────┘
      ↓
┌───────────────────────────────────┐
│ Level 2: Utils                    │
│ - selectUtxosForPegin()           │
│ - Fee constants & calculation     │
│ - Transaction helpers             │
└───────────────────────────────────┘
      ↓
┌───────────────────────────────────┐
│ Level 1: Primitives               │
│ - buildPeginPsbt()                │
│ - buildPayoutPsbt()               │
│ - extractPayoutSignature()        │
│ - Pure functions, no side effects │
└───────────────────────────────────┘
      ↓
┌───────────────────────────────────┐
│ WASM (Rust Core)                  │
│ - Bitcoin script generation       │
│ - Cryptographic operations        │
└───────────────────────────────────┘
```

---

## Setup

```typescript
import {
  buildPeginPsbt,
  buildPayoutPsbt,
  extractPayoutSignature,
} from "@babylonlabs-io/ts-sdk/tbv/core/primitives";
import { Psbt, networks } from "bitcoinjs-lib";
```

## Quickstart

### Peg-in

Deposit BTC into a TBV.

`buildPeginPsbt()` returns:

- `vaultScriptPubKey` - The vault output script (use this to build the vault output)
- `vaultValue` - The vault output value in satoshis
- `psbtHex` - Unfunded transaction hex (0 inputs, 1 vault output)
- `txid` - Transaction ID (changes after funding)

**Required:** Fund the transaction with UTXOs, sign it, and broadcast.

```typescript
import { Psbt, networks } from "bitcoinjs-lib";
import { buildPeginPsbt } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";

// Network mapping
const NETWORK_MAP = {
  bitcoin: networks.bitcoin,
  testnet: networks.testnet,
  regtest: networks.regtest,
  signet: networks.testnet,
} as const;

const DUST_THRESHOLD = 546n;

async function pegin() {
  // Step 1: Build unfunded transaction with vault output
  const pegin = await buildPeginPsbt({
    depositorPubkey: "a1b2c3d4...", // your x-only pubkey (64 hex chars)
    claimerPubkey: "e5f6a7b8...", // vault provider pubkey
    challengerPubkeys: ["c9d0e1f2..."], // liquidator pubkeys
    pegInAmount: 100000n, // satoshis
    network: "signet",
  });

  console.log("Vault script:", pegin.vaultScriptPubKey);
  console.log("Vault value:", pegin.vaultValue);

  // Step 2: Fund the transaction
  const psbt = new Psbt({ network: NETWORK_MAP["signet"] });

  // Add your funding UTXO as input
  psbt.addInput({
    hash: "your-utxo-txid",
    index: 0,
    witnessUtxo: {
      script: Buffer.from("your-utxo-script", "hex"),
      value: 200000, // your UTXO value
    },
  });

  // Add vault output
  psbt.addOutput({
    script: Buffer.from(pegin.vaultScriptPubKey, "hex"),
    value: Number(pegin.vaultValue),
  });

  // Add change output (if above dust threshold)
  const fee = 1000n;
  const change = 200000n - 100000n - fee;
  if (change > DUST_THRESHOLD) {
    psbt.addOutput({
      address: "your-change-address",
      value: Number(change),
    });
  }

  // Step 3: Sign with your wallet and broadcast
  const unsignedPsbtHex = psbt.toHex();
  // const signedPsbt = await yourWallet.signPsbt(unsignedPsbtHex);
  // const tx = Psbt.fromHex(signedPsbt).extractTransaction();
  // await broadcast(tx.toHex());
}
```

### Payout Authorization Signing (Peg-In Step 3)

**⚠️ Context:** This is NOT withdrawal/redemption! After you register your peg-in on Ethereum (Step 2), the vault provider prepares claim/payout transaction pairs. You must sign these to **pre-authorize future fund distribution**.

See the [Managers Guide - Payout Authorization](./managers.md#payout-authorization-part-of-peg-in) for the complete peg-in flow context.

**What happens:**

1. You register peg-in on Ethereum → vault status = PENDING
2. Vault provider prepares claim/payout transaction pairs
3. You sign payout authorizations using `buildPayoutPsbt()` ← **YOU ARE HERE**
4. Vault provider collects signatures → vault status = VERIFIED
5. You broadcast Bitcoin transaction (Step 4)

`buildPayoutPsbt()` returns:

- `psbtHex` - Unsigned PSBT ready for signing (input 0 is the vault UTXO)

`extractPayoutSignature()` returns:

- 64-byte Schnorr signature (128 hex chars) to submit to the vault provider

**Required:**

1. Poll vault provider RPC for prepared transactions
2. Sign each payout transaction
3. Extract signatures
4. Submit to vault provider RPC

```typescript
import {
  buildPayoutPsbt,
  extractPayoutSignature,
} from "@babylonlabs-io/ts-sdk/tbv/core/primitives";

async function payout() {
  // Step 1: Receive payout request from vault keeper
  const payoutTxHex = "..."; // from vault keeper
  const claimTxHex = "..."; // from vault keeper
  const peginTxHex = "..."; // your original peg-in transaction

  // Step 2: Build unsigned PSBT for signing
  const payoutPsbt = await buildPayoutPsbt({
    payoutTxHex,
    peginTxHex,
    claimTxHex,
    depositorBtcPubkey: "a1b2c3d4...", // your x-only pubkey
    vaultProviderBtcPubkey: "e5f6a7b8...", // vault provider pubkey
    liquidatorBtcPubkeys: ["c9d0e1f2..."], // liquidator pubkeys
    network: "signet",
  });

  console.log("PSBT to sign:", payoutPsbt.psbtHex);

  // Step 3: Sign input 0 (the vault UTXO) with your wallet
  // const signedPsbtHex = await yourWallet.signPsbt(payoutPsbt.psbtHex);

  // Step 4: Extract signature and submit to vault provider
  // const signature = extractPayoutSignature(signedPsbtHex, "a1b2c3d4...");
  // await submitToVaultProvider(signature);
}
```

---
