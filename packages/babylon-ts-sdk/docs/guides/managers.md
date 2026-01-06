# Babylon Trustless Bitcoin Vault (TBV) SDK - Managers Guide

High-level orchestration for TBV operations with wallet integration.

## Table of Contents

1. [Introduction](#introduction)
2. [When to Use Managers](#when-to-use-managers)
3. [Installation & Setup](#installation--setup)
4. [Complete TBV Lifecycle](#complete-tbv-lifecycle)
5. [Error Handling](#error-handling)
6. [Migration from Primitives](#migration-from-primitives)

---

## Introduction

### What are Managers?

Managers are high-level classes that orchestrate TBV operations by:

- Coordinating between primitives, utilities, and wallets
- Handling complex multi-step flows automatically
- Managing Ethereum and Bitcoin interactions
- Providing built-in error handling

**Analogy:**

- **Primitives** = Individual bricks (full control, manual assembly)
- **Managers** = Pre-built sets (faster, guided, but less flexible)

### Architecture Overview

```
Your Application
       ↓
Managers (Level 2)
       ↓
Primitives (Level 1)
       ↓
WASM (Rust Core)
```

### Available Managers

- **`PeginManager`** - Orchestrates the complete peg-in flow (deposit BTC into TBV)
- **`PayoutManager`** - Orchestrates payout signing (withdraw BTC from TBV)

---

## When to Use Managers

| Scenario                              | Use Managers | Use Primitives |
| ------------------------------------- | ------------ | -------------- |
| Frontend app with wallet integration  | ✅ Yes       | ❌ No          |
| Quick integration, less code          | ✅ Yes       | ❌ No          |
| Backend with custom signing (KMS/HSM) | ❌ No        | ✅ Yes         |
| Need full control over every step     | ❌ No        | ✅ Yes         |
| Serverless with custom flow           | ❌ No        | ✅ Yes         |

**Rule of thumb:** If you're using browser wallets (`UniSat`, `OKX`, `MetaMask`), use managers.

---

## Installation & Setup

### Installation

```bash
npm install @babylonlabs-io/ts-sdk viem
```

See the [Installation Guide](../get-started/installation.md) for detailed setup instructions.

### Basic Setup

```typescript
import { PeginManager, PayoutManager } from "@babylonlabs-io/ts-sdk/tbv/core";
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { createWalletClient, custom } from "viem";
import { sepolia } from "viem/chains";

// Bitcoin wallet (implements BitcoinWallet interface)
// Example: UniSat, Leather, or custom wallet adapter
const btcWallet: BitcoinWallet = {
  getPublicKeyHex: async () => "...",
  signPsbt: async (psbtHex) => "...",
  signMessage: async (message, protocol) => "...",
};

// Ethereum wallet (viem WalletClient)
const ethWallet = createWalletClient({
  chain: sepolia,
  transport: custom(window.ethereum),
});
```

### Manager Configuration

```typescript
// Configure PeginManager
const peginManager = new PeginManager({
  btcNetwork: "signet",
  btcWallet,
  ethWallet,
  ethChain: sepolia,
  vaultContracts: {
    btcVaultsManager: "0x...", // BTCVaultsManager contract address
  },
  mempoolApiUrl: "https://mempool.space/signet/api",
});

// Configure PayoutManager
const payoutManager = new PayoutManager({
  network: "signet",
  btcWallet,
});
```

---

## Complete TBV Lifecycle

### Overview: The Full Flow

The complete Trustless Bitcoin Vault (TBV) lifecycle consists of:

1. **Peg-In Flow** - Deposit BTC into TBV
   - Prepare peg-in transaction (build + fund + select UTXOs)
   - Register on Ethereum (submit to contract with proof-of-possession)
   - Sign and broadcast to Bitcoin network

2. **Payout Flow** - Withdraw BTC from TBV
   - Receive payout request from vault provider
   - Sign payout transaction
   - Submit signature to vault provider

---

## Peg-In Flow

The peg-in flow deposits BTC into a TBV by coordinating Bitcoin and Ethereum transactions.

### Step 1: Prepare the Peg-In Transaction

Build and fund the peg-in transaction with automatic UTXO selection:

```typescript
const result = await peginManager.preparePegin({
  amount: 100000n, // satoshis
  vaultProvider: "0x456...", // Vault provider's Ethereum address
  vaultProviderBtcPubkey: "abc...", // Vault provider's BTC pubkey (x-only, 64 chars)
  liquidatorBtcPubkeys: ["def..."], // Liquidator BTC pubkeys
  availableUTXOs: utxos, // Your available UTXOs
  feeRate: 1, // Fee rate in sat/vB
  changeAddress: "tb1q...", // Your BTC change address
});

console.log("BTC Transaction Hash:", result.btcTxHash);
console.log("Selected UTXOs:", result.selectedUTXOs);
console.log("Fee:", result.fee);
console.log("Change Amount:", result.changeAmount);
```

**What happens internally:**

1. Gets depositor BTC public key from wallet
2. Calls `buildPeginPsbt()` primitive to create TBV output
3. Selects UTXOs using iterative fee calculation
4. Funds transaction by adding inputs and change output

**Returns:**

- `btcTxHash` - Bitcoin transaction hash (deterministic vault ID)
- `fundedTxHex` - Funded but unsigned transaction
- `selectedUTXOs` - UTXOs selected for funding
- `fee` - Transaction fee in satoshis
- `changeAmount` - Change amount in satoshis

### Step 2: Register on Ethereum

Submit the peg-in request to the Ethereum contract:

```typescript
const { ethTxHash, vaultId } = await peginManager.registerPeginOnChain({
  depositorBtcPubkey: "abc...", // Your BTC pubkey (x-only, 64 chars)
  unsignedBtcTx: result.fundedTxHex,
  vaultProvider: "0x456...", // Vault provider's Ethereum address
});

console.log(`TBV registered! ID: ${vaultId}`);
console.log(`Ethereum TX: ${ethTxHash}`);
```

**What happens internally:**

1. Gets depositor ETH address from wallet
2. Creates proof-of-possession (BTC signature of ETH address using BIP-322)
3. Checks if vault already exists (pre-flight check)
4. Encodes contract call using viem
5. Sends transaction via `ethWallet.sendTransaction()`

**Returns:**

- `ethTxHash` - Ethereum transaction hash
- `vaultId` - Vault identifier (same as `btcTxHash` but with "0x" prefix)

**Optional callback for UI updates:**

```typescript
const { ethTxHash, vaultId } = await peginManager.registerPeginOnChain({
  depositorBtcPubkey: "abc...",
  unsignedBtcTx: result.fundedTxHex,
  vaultProvider: "0x456...",
  onPopSigned: async () => {
    // Called after BTC signature (PoP) but before ETH transaction
    console.log("PoP signature complete, requesting ETH signature...");
  },
});
```

### Step 3: Sign and Broadcast to Bitcoin

Sign the peg-in transaction and broadcast to Bitcoin network:

```typescript
const btcTxid = await peginManager.signAndBroadcast({
  fundedTxHex: result.fundedTxHex,
  depositorBtcPubkey: "abc...", // Your BTC pubkey (x-only, 64 chars)
});

console.log(`Bitcoin TX: ${btcTxid}`);
console.log(`View: https://mempool.space/signet/tx/${btcTxid}`);
```

**What happens internally:**

1. Parses the funded transaction
2. Fetches UTXO data from mempool API for each input
3. Creates PSBT with proper `witnessUtxo` and `tapInternalKey`
4. Signs via `btcWallet.signPsbt()`
5. Finalizes and extracts transaction
6. Broadcasts via mempool API

**Returns:**

- Bitcoin transaction ID (txid)

### Complete Peg-In Example

```typescript
import { PeginManager } from "@babylonlabs-io/ts-sdk/tbv/core";

async function depositBTC() {
  // Step 1: Prepare transaction
  const pegin = await peginManager.preparePegin({
    amount: 100000n,
    vaultProvider: "0x456...",
    vaultProviderBtcPubkey: "abc...",
    liquidatorBtcPubkeys: ["def..."],
    availableUTXOs: utxos,
    feeRate: 1,
    changeAddress: "tb1q...",
  });

  // Step 2: Register on Ethereum
  const { ethTxHash, vaultId } = await peginManager.registerPeginOnChain({
    depositorBtcPubkey: "abc...",
    unsignedBtcTx: pegin.fundedTxHex,
    vaultProvider: "0x456...",
  });

  // Step 3: Broadcast to Bitcoin
  const btcTxid = await peginManager.signAndBroadcast({
    fundedTxHex: pegin.fundedTxHex,
    depositorBtcPubkey: "abc...",
  });

  console.log("Peg-in complete!");
  console.log("Vault ID:", vaultId);
  console.log("Bitcoin TX:", btcTxid);
  console.log("Ethereum TX:", ethTxHash);
}
```

---

## Payout Flow

The payout flow withdraws BTC from a TBV by signing a payout transaction provided by the vault provider.

### Overview

When you want to withdraw from the TBV:

1. Vault provider creates payout transaction pair
2. You sign the payout transaction using PayoutManager
3. You submit the signature to vault provider
4. Vault provider finalizes and broadcasts

### Step 1: Receive Payout Request

The vault provider sends you:

- `payoutTxHex` - Unsigned payout transaction
- `claimTxHex` - Claim transaction (for script generation)
- `peginTxHex` - Your original peg-in transaction

```typescript
// Received from vault provider API
const payoutRequest = {
  payoutTxHex: "...",
  claimTxHex: "...",
  peginTxHex: "...",
};
```

### Step 2: Sign Payout Transaction

Use PayoutManager to sign the payout transaction:

```typescript
const payoutManager = new PayoutManager({
  network: "signet",
  btcWallet,
});

const { signature, depositorBtcPubkey } =
  await payoutManager.signPayoutTransaction({
    payoutTxHex: payoutRequest.payoutTxHex,
    peginTxHex: payoutRequest.peginTxHex,
    claimTxHex: payoutRequest.claimTxHex,
    vaultProviderBtcPubkey: "abc...", // From vault provider
    liquidatorBtcPubkeys: ["def..."], // From vault provider
    depositorBtcPubkey: "xyz...", // Optional: your pubkey (will fetch from wallet if not provided)
  });

console.log("Signature:", signature); // 64-byte Schnorr signature (128 hex chars)
```

**What happens internally:**

1. Gets depositor BTC public key from wallet and converts to x-only format
2. Validates wallet pubkey matches on-chain depositor pubkey (if provided)
3. Builds unsigned PSBT using `buildPayoutPsbt()` primitive
4. Signs PSBT via `btcWallet.signPsbt()`
5. Extracts 64-byte Schnorr signature using `extractPayoutSignature()` primitive

**Returns:**

- `signature` - 64-byte Schnorr signature (128 hex characters)
- `depositorBtcPubkey` - Your BTC public key used for signing

### Step 3: Submit Signature

Submit the signature to the vault provider:

```typescript
// Submit to vault provider API
await vaultProviderAPI.submitPayoutSignature({
  vaultId: "0x...",
  payoutTxHash: "...",
  signature,
});

console.log(
  "Payout signature submitted! Waiting for vault provider to finalize...",
);
```

### Complete Payout Example

```typescript
import { PayoutManager } from "@babylonlabs-io/ts-sdk/tbv/core";

async function withdrawBTC(payoutRequest) {
  // Create manager
  const payoutManager = new PayoutManager({
    network: "signet",
    btcWallet,
  });

  // Sign payout transaction
  const { signature } = await payoutManager.signPayoutTransaction({
    payoutTxHex: payoutRequest.payoutTxHex,
    peginTxHex: payoutRequest.peginTxHex,
    claimTxHex: payoutRequest.claimTxHex,
    vaultProviderBtcPubkey: "abc...",
    liquidatorBtcPubkeys: ["def..."],
  });

  // Submit to vault provider
  await vaultProviderAPI.submitPayoutSignature({
    vaultId: payoutRequest.vaultId,
    signature,
  });

  console.log("Payout signature submitted!");
}
```

---

## Error Handling

### Common Errors

| Error                        | Where                    | Cause                                      | Solution                                    |
| ---------------------------- | ------------------------ | ------------------------------------------ | ------------------------------------------- |
| `Vault already exists`       | `registerPeginOnChain()` | Vault ID is deterministic from transaction | Use different UTXOs or amount               |
| `Insufficient funds`         | `preparePegin()`         | Not enough UTXOs to cover amount + fees    | Add more UTXOs or reduce amount             |
| `wallet account not found`   | Any manager method       | Wallet not connected                       | Prompt user to connect wallet               |
| `Invalid depositorBtcPubkey` | `signAndBroadcast()`     | Pubkey wrong format                        | Use x-only format (64 hex chars, no prefix) |

### Error Handling Pattern

```typescript
async function safePegin() {
  try {
    const pegin = await peginManager.preparePegin({...});
    const { ethTxHash, vaultId } = await peginManager.registerPeginOnChain({...});
    const btcTxid = await peginManager.signAndBroadcast({...});
    return { success: true, vaultId, ethTxHash, btcTxid };
  } catch (error) {
    console.error("Peg-in failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
```

---

## Migration from Primitives

If you're using primitives and want to simplify your code:

### Before (Primitives) → After (Managers)

**10 manual steps** → **3 manager calls**

```typescript
// Before: ~200 lines with manual UTXO selection, fee calculation,
// funding, proof-of-possession, contract encoding, PSBT creation, signing, broadcasting

// After: ~30 lines with PeginManager
const pegin = await peginManager.preparePegin({...});           // Handles steps 1-3
const { ethTxHash } = await peginManager.registerPeginOnChain({...}); // Handles steps 4-6
const btcTxid = await peginManager.signAndBroadcast({...});     // Handles steps 7-10
```

**Migration steps:**

1. Replace UTXO selection/funding → `preparePegin()`
2. Replace PoP + contract call → `registerPeginOnChain()`
3. Replace PSBT creation/signing/broadcast → `signAndBroadcast()`
4. Update error handling

See [Primitives Guide](./primitives.md) for the full primitives implementation.

---

## Real-World Example

Here's how the babylon-toolkit TBV service uses managers:

```typescript
// From babylon-toolkit/services/vault/src/services/vault/vaultTransactionService.ts

export async function submitPeginRequest(
  btcWallet: BitcoinWallet,
  ethWallet: WalletClient,
  params: SubmitPeginParams,
): Promise<SubmitPeginResult> {
  // Create PeginManager
  const peginManager = new PeginManager({
    btcNetwork: getBTCNetworkForWASM(),
    btcWallet,
    ethWallet,
    ethChain: getETHChain(),
    vaultContracts: {
      btcVaultsManager: CONTRACTS.BTC_VAULTS_MANAGER,
    },
    mempoolApiUrl: getMempoolApiUrl(),
  });

  // Get depositor BTC pubkey and convert to x-only format
  const depositorBtcPubkeyRaw = await btcWallet.getPublicKeyHex();
  const depositorBtcPubkey =
    depositorBtcPubkeyRaw.length === 66
      ? depositorBtcPubkeyRaw.slice(2) // Strip first byte (02 or 03)
      : depositorBtcPubkeyRaw; // Already x-only

  // Prepare peg-in
  const peginResult = await peginManager.preparePegin({
    amount: params.pegInAmount,
    vaultProvider: params.vaultProviderAddress,
    vaultProviderBtcPubkey: params.vaultProviderBtcPubkey,
    liquidatorBtcPubkeys: params.liquidatorBtcPubkeys,
    availableUTXOs: params.availableUTXOs,
    feeRate: params.feeRate,
    changeAddress: params.changeAddress,
  });

  // Register on-chain
  const registrationResult = await peginManager.registerPeginOnChain({
    depositorBtcPubkey,
    unsignedBtcTx: peginResult.fundedTxHex,
    vaultProvider: params.vaultProviderAddress,
    onPopSigned: params.onPopSigned, // Optional callback for UI updates
  });

  return {
    transactionHash: registrationResult.ethTxHash,
    btcTxHash: registrationResult.vaultId,
    btcTxHex: peginResult.fundedTxHex,
    selectedUTXOs: peginResult.selectedUTXOs,
    fee: peginResult.fee,
  };
}
```

---

## Next Steps

- **[API Reference](../api/managers.md)** - Complete API documentation for managers
- **[Primitives Guide](./primitives.md)** - Lower-level API for custom implementations
- **[Installation Guide](../get-started/installation.md)** - Setup and troubleshooting

## Need Help?

- [GitHub Issues](https://github.com/babylonlabs-io/babylon-toolkit/issues)
- [SDK Documentation](../../README.md)
