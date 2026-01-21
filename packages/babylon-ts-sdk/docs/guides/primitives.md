# Babylon TBV TypeScript SDK - Primitives

Pure functions for building Bitcoin transactions for Babylon Trustless BTC Vault (TBV).

## Table of Contents

1. [Important: Primitives vs Managers](#️-important-primitives-vs-managers)
2. [Understanding the SDK Layers](#understanding-the-sdk-layers)
   - 2.1. [Level 1: Primitives (Pure Functions)](#level-1-primitives-pure-functions)
   - 2.2. [Level 2: Utils (Helper Functions)](#level-2-utils-helper-functions)
   - 2.3. [What You Must Still Implement](#what-you-must-still-implement)
   - 2.4. [When to Use Primitives](#when-to-use-primitives)
   - 2.5. [Level 3: Managers (Full Orchestration)](#level-3-managers-full-orchestration)
3. [Installation](#installation)
4. [Architecture Layers](#architecture-layers)
5. [Setup](#setup)
6. [Quickstart](#quickstart)
   - 6.1. [Peg-in](#peg-in)
   - 6.2. [Payout Authorization Signing (Peg-In Step 3)](#payout-authorization-signing-peg-in-step-3)

---

## ⚠️ Important: Primitives vs Managers

## Understanding the SDK Layers

The SDK provides three levels of abstraction:

### Level 1: Primitives (Pure Functions)

**What Primitives Provide:**

- ✅ Pure Bitcoin transaction builders (`buildPeginPsbt`, `buildPayoutOptimisticPsbt`, `buildPayoutPsbt`)
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
│ - buildPayoutOptimisticPsbt()     │
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
  buildPayoutOptimisticPsbt,
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
    vaultProviderPubkey: "e5f6a7b8...", // vault provider pubkey
    vaultKeeperPubkeys: ["c9d0e1f2..."], // vault keeper pubkeys
    universalChallengerBtcPubkeys: ["f3g4h5i6..."], // universal challenger pubkeys
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
3. You sign payout authorizations using **TWO primitives** ← **YOU ARE HERE**
4. Vault provider collects signatures → vault status = VERIFIED
5. You broadcast Bitcoin transaction (Step 4)

#### Payout Transaction Types

During Step 3, you sign **TWO payout transactions** for each claimer to support both execution paths:

1. **PayoutOptimistic** (Optimistic Path)
   - Used when no challenge occurs (normal case)
   - Flow: Vault → Claim → **PayoutOptimistic**
   - Input 1 references Claim transaction output 0
   - Faster, lower cost

2. **Payout** (Challenge Path)
   - Used when a challenge is raised
   - Flow: Vault → Claim → Assert → **Payout**
   - Input 1 references Assert transaction output 0
   - Claimer must prove validity via Assert

Both transactions are pre-signed during peg-in, but only one will be executed depending on whether a challenge occurs.

#### Primitives for Payout Signing

`buildPayoutOptimisticPsbt()` returns:
- `psbtHex` - Unsigned PSBT for optimistic path (input 1 from Claim tx)

`buildPayoutPsbt()` returns:
- `psbtHex` - Unsigned PSBT for challenge path (input 1 from Assert tx)

`extractPayoutSignature()` returns:
- 64-byte Schnorr signature (128 hex chars) to submit to vault provider

**Required:**

1. Poll vault provider RPC for prepared transactions (receives BOTH types)
2. Sign BOTH payout transactions for each claimer
3. Extract both signatures
4. Submit both signatures to vault provider RPC

```typescript
import {
  buildPayoutOptimisticPsbt,
  buildPayoutPsbt,
  extractPayoutSignature,
} from "@babylonlabs-io/ts-sdk/tbv/core/primitives";

async function signPayoutAuthorizations() {
  // Step 1: Receive transactions from vault provider
  // Vault provider returns BOTH PayoutOptimistic and Payout transactions
  const claimerTx = {
    claimer_pubkey: "abc123...",
    claim_tx: { tx_hex: "..." },
    assert_tx: { tx_hex: "..." },
    payout_optimistic_tx: { tx_hex: "..." }, // Optimistic path
    payout_tx: { tx_hex: "..." },           // Challenge path
  };
  const peginTxHex = "..."; // your original peg-in transaction

  // Step 2a: Build unsigned PSBT for PayoutOptimistic (optimistic path)
  const payoutOptimisticPsbt = await buildPayoutOptimisticPsbt({
    payoutOptimisticTxHex: claimerTx.payout_optimistic_tx.tx_hex,
    peginTxHex,
    claimTxHex: claimerTx.claim_tx.tx_hex, // Input 1 from Claim
    depositorBtcPubkey: "a1b2c3d4...", // your x-only pubkey
    vaultProviderBtcPubkey: "e5f6a7b8...", // vault provider pubkey
    vaultKeeperBtcPubkeys: ["c9d0e1f2..."], // vault keeper pubkeys
    universalChallengerBtcPubkeys: ["f3g4h5i6..."], // universal challenger pubkeys
    network: "signet",
  });

  // Step 2b: Build unsigned PSBT for Payout (challenge path)
  const payoutPsbt = await buildPayoutPsbt({
    payoutTxHex: claimerTx.payout_tx.tx_hex,
    peginTxHex,
    assertTxHex: claimerTx.assert_tx.tx_hex, // Input 1 from Assert
    depositorBtcPubkey: "a1b2c3d4...", // your x-only pubkey
    vaultProviderBtcPubkey: "e5f6a7b8...", // vault provider pubkey
    vaultKeeperBtcPubkeys: ["c9d0e1f2..."], // vault keeper pubkeys
    universalChallengerBtcPubkeys: ["f3g4h5i6..."], // universal challenger pubkeys
    network: "signet",
  });

  // Step 3: Sign BOTH PSBTs with your wallet (input 0 only)
  // const signedPayoutOptimisticHex = await yourWallet.signPsbt(payoutOptimisticPsbt.psbtHex);
  // const signedPayoutHex = await yourWallet.signPsbt(payoutPsbt.psbtHex);

  // Step 4: Extract BOTH signatures
  // const payoutOptimisticSig = extractPayoutSignature(signedPayoutOptimisticHex, "a1b2c3d4...");
  // const payoutSig = extractPayoutSignature(signedPayoutHex, "a1b2c3d4...");

  // Step 5: Submit BOTH signatures to vault provider
  // await submitToVaultProvider({
  //   claimer_pubkey: claimerTx.claimer_pubkey,
  //   payout_optimistic_signature: payoutOptimisticSig,
  //   payout_signature: payoutSig,
  // });
}
```

---

