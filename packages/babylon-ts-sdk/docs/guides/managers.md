# Babylon Trustless Bitcoin Vault (TBV) SDK - Managers Guide

High-level orchestration for TBV operations with wallet integration.

## Table of Contents

1. [Introduction](#introduction)
2. [When to Use Managers](#when-to-use-managers)
3. [Installation & Setup](#installation--setup)
4. [Complete TBV Lifecycle](#complete-tbv-lifecycle)
5. [Peg-In Flow](#peg-in-flow)
   - 5.1. [Step 1: Prepare Transaction](#step-1-prepare-the-peg-in-transaction)
   - 5.2. [Step 2: Register on Ethereum](#step-2-register-on-ethereum)
   - 5.3. [Step 3: Sign Payout Authorization](#step-3-sign-payout-authorization)
   - 5.4. [Step 4: Broadcast to Bitcoin](#step-4-sign-and-broadcast-to-bitcoin)
6. [TBV Architecture: Core vs Applications](#tbv-architecture-core-vs-applications)
7. [Redemption Flow (Application-Specific Withdrawal)](#redemption-flow-application-specific-withdrawal)
8. [Error Handling](#error-handling)
9. [Migration from Primitives](#migration-from-primitives)
10. [Real-World Example](#real-world-example)

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

- **`PeginManager`** - Orchestrates the peg-in deposit flow (prepare, register on Ethereum, broadcast to Bitcoin)
- **`PayoutManager`** - Signs payout authorization transactions (used during peg-in to pre-authorize fund distribution)

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

> **🚀 Quick Start**: For a complete working example with OKX Wallet and React, see the [Managers Quickstart Guide](../quickstart/managers.md).

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

1. **Peg-In Flow** - Deposit BTC into TBV (4 steps)
   - **Step 1:** Prepare peg-in transaction (build + fund + select UTXOs)
   - **Step 2:** Register on Ethereum (submit to contract with proof-of-possession)
   - **Step 3:** Sign payout authorization (pre-authorize vault provider to distribute funds)
   - **Step 4:** Sign and broadcast to Bitcoin network

2. **Redemption Flow** - Withdraw BTC from TBV (1 step)
   - Call `redeemBTCVault()` on Ethereum (vault provider handles Bitcoin side using pre-signed authorizations from Step 3)

**Important Note:** Payout authorization (Step 3) is NOT the same as redemption/withdrawal. During peg-in, you pre-sign transactions that authorize the vault provider to distribute your funds in the future. When you actually want to withdraw (redemption), you simply make an Ethereum contract call - no Bitcoin wallet signing required at that point.

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
  vaultKeeperBtcPubkeys: ["def..."], // Vault keeper BTC pubkeys
  universalChallengerBtcPubkeys: ["ghi..."], // Universal challenger BTC pubkeys
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

**After Step 2**, the vault contract status is `PENDING`. You must wait for the vault provider to prepare claim and payout transaction pairs before proceeding.

---

### Step 3: Sign Payout Authorization

**Wait for vault provider** to prepare claim/payout transaction pairs (poll their RPC API):

```typescript
// Poll vault provider RPC for transactions
// Vault provider returns BOTH PayoutOptimistic and Payout transactions
interface ClaimerTransaction {
  claimer_pubkey: string;
  claim_tx: { tx_hex: string };
  assert_tx: { tx_hex: string };
  payout_optimistic_tx: { tx_hex: string }; // Optimistic path
  payout_tx: { tx_hex: string };           // Challenge path
}

async function requestClaimAndPayoutTransactions(
  vaultProviderUrl: string,
  peginTxId: string,
  depositorPk: string,
): Promise<ClaimerTransaction[]> {
  const response = await fetch(vaultProviderUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "vaultProvider_requestClaimAndPayoutTransactions",
      params: [{ pegin_tx_id: peginTxId, depositor_pk: depositorPk }],
      id: 1,
    }),
  });

  const json = await response.json();
  if (json.error) {
    throw new Error(`RPC Error: ${json.error.message}`);
  }
  return json.result.txs;
}

// Poll until transactions are ready
let claimerTransactions: ClaimerTransaction[] | undefined;
while (!claimerTransactions) {
  try {
    claimerTransactions = await requestClaimAndPayoutTransactions(
      vaultProviderUrl,
      vaultId.slice(2), // Remove 0x prefix
      depositorBtcPubkey,
    );
  } catch (error) {
    // Wait and retry if transactions not ready yet
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
```

#### Payout Transaction Types

During Step 3, you sign **TWO payout transactions** for each claimer:

1. **PayoutOptimistic** (Optimistic Path) - Used when no challenge occurs
   - Flow: Vault → Claim → PayoutOptimistic
   - Faster, lower cost execution

2. **Payout** (Challenge Path) - Used when a challenge is raised
   - Flow: Vault → Claim → Assert → Payout
   - Claimer must prove validity via Assert transaction

Both are pre-signed now, but only one will be executed depending on whether a challenge occurs during redemption.

**Sign payout authorizations** using PayoutManager:

```typescript
const payoutManager = new PayoutManager({
  network: "signet",
  btcWallet,
});

// Sign BOTH payout transactions for each claimer
interface ClaimerSignatures {
  payout_optimistic_signature: string;
  payout_signature: string;
}

const signatures: Record<string, ClaimerSignatures> = {};

for (const claimerTx of claimerTransactions) {
  // Sign PayoutOptimistic (optimistic path)
  const { signature: payoutOptimisticSig } = await payoutManager.signPayoutOptimisticTransaction({
    payoutOptimisticTxHex: claimerTx.payout_optimistic_tx.tx_hex,
    peginTxHex: result.fundedTxHex,
    claimTxHex: claimerTx.claim_tx.tx_hex,
    vaultProviderBtcPubkey: "abc...", // Vault provider's BTC pubkey
    vaultKeeperBtcPubkeys: ["def..."], // Vault keeper pubkeys
    universalChallengerBtcPubkeys: ["ghi..."], // Universal challenger pubkeys
    depositorBtcPubkey: "xyz...", // Your BTC pubkey
  });

  // Sign Payout (challenge path)
  const { signature: payoutSig } = await payoutManager.signPayoutTransaction({
    payoutTxHex: claimerTx.payout_tx.tx_hex,
    peginTxHex: result.fundedTxHex,
    assertTxHex: claimerTx.assert_tx.tx_hex,
    vaultProviderBtcPubkey: "abc...", // Vault provider's BTC pubkey
    vaultKeeperBtcPubkeys: ["def..."], // Vault keeper pubkeys
    universalChallengerBtcPubkeys: ["ghi..."], // Universal challenger pubkeys
    depositorBtcPubkey: "xyz...", // Your BTC pubkey
  });

  // Store BOTH signatures keyed by claimer pubkey
  const claimerPubkeyXOnly =
    claimerTx.claimer_pubkey.length === 66
      ? claimerTx.claimer_pubkey.substring(2)
      : claimerTx.claimer_pubkey;

  signatures[claimerPubkeyXOnly] = {
    payout_optimistic_signature: payoutOptimisticSig,
    payout_signature: payoutSig,
  };
}
```

**Submit signatures** to vault provider:

```typescript
async function submitPayoutSignatures(
  vaultProviderUrl: string,
  peginTxId: string,
  depositorPk: string,
  signatures: Record<string, ClaimerSignatures>,
): Promise<void> {
  const response = await fetch(vaultProviderUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "vaultProvider_submitPayoutSignatures",
      params: [
        {
          pegin_tx_id: peginTxId,
          depositor_pk: depositorPk,
          signatures,
        },
      ],
      id: 2,
    }),
  });

  const json = await response.json();
  if (json.error) {
    throw new Error(`RPC Error: ${json.error.message}`);
  }
}

await submitPayoutSignatures(
  vaultProviderUrl,
  vaultId.slice(2), // Remove 0x prefix
  depositorBtcPubkey,
  signatures,
);

console.log(
  "Payout signatures submitted! Waiting for vault provider to acknowledge...",
);
```

**What happens internally:**

1. Gets depositor BTC public key from wallet and converts to x-only format
2. Validates wallet pubkey matches on-chain depositor pubkey
3. For PayoutOptimistic: Builds unsigned PSBT using `buildPayoutOptimisticPsbt()` primitive
4. For Payout: Builds unsigned PSBT using `buildPayoutPsbt()` primitive
5. Signs both PSBTs via `btcWallet.signPsbt()`
6. Extracts 64-byte Schnorr signatures using `extractPayoutSignature()` primitive

**What you're authorizing:**

By signing these payout transactions, you're **pre-authorizing** the vault provider to distribute your funds in two possible ways:
- **Optimistic path**: Faster redemption if no challenge occurs
- **Challenge path**: Secure redemption even if challenged

These signatures will be used later when you initiate redemption, depending on whether a challenge occurs.

**Wait for contract status update:** After vault provider collects all required signatures, they'll submit acknowledgements on-chain. The vault contract status will change from `PENDING` (0) → `VERIFIED` (1). Only then can you proceed to Step 4.

---

### Step 4: Sign and Broadcast to Bitcoin

**After contract status is `VERIFIED`**, sign the peg-in transaction and broadcast to Bitcoin network:

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

**Bitcoin Confirmation Requirement:**

After broadcasting to Bitcoin, the vault requires **30 block confirmations** (~5 hours) before becoming available. During this time:

- Contract status remains `VERIFIED` (1)
- Once Bitcoin transaction reaches 30 confirmations, contract transitions to `ACTIVE` (2)
- The vault is then ready for use in applications

---

## TBV Architecture: Core vs Applications

Before understanding redemption, it's important to understand the two-layer architecture:

### Core Layer (`BTCVaultsManager`)

The core vault manager handles fundamental vault operations:

- **Peg-in lifecycle**: PENDING → VERIFIED → ACTIVE → REDEEMED
- **Proof-of-possession** verification
- **ACK collection** from vault providers
- **Bitcoin inclusion proofs**

The core layer is intentionally minimal and reusable across all applications.

### Application Layer (AAVE, Morpho, etc.)

Applications build on top of core vaults and implement:

- **Redemption logic** (application-specific)
- **Business rules** (e.g., can't redeem while collateralizing a loan)
- **Vault usage tracking** (Available/InUse/Redeemed states)
- **DeFi integrations** (lending, borrowing, etc.)

By keeping redemption in the application layer, the core TBV infrastructure remains:

- ✅ Simple and secure
- ✅ Reusable across any application
- ✅ Focused on Bitcoin/Ethereum correctness

---

## Redemption Flow (Application-Specific Withdrawal)

**⚠️ Important:** Redemption is handled by **application controllers** (e.g., AAVE Integration Controller), not the core TBV SDK. The SDK provides peg-in and payout authorization helpers (Steps 1-4), but redemption logic is application-specific and will be provided in separate application SDK packages.

This section describes the general architectural pattern that applies across all applications.

### Overview

**Key Differences from Peg-In:**

- **Peg-in** (deposit) = 4-step process using `PeginManager` + `PayoutManager`
- **Redemption** (withdrawal) = Application-specific Ethereum transaction (no SDK manager)

Redemption is a **one-step Ethereum-only process**:

1. Call application's redeem function on the application controller contract (ETH wallet signature)
   - AAVE: `depositorRedeem(vaultId)`
   - Morpho: `redeemBTCVault(vaultId)`
2. Application validates business rules (e.g., vault not in use)
3. Application updates core vault status to REDEEMED
4. Vault provider handles the Bitcoin side using your pre-signed payout authorizations from peg-in Step 3

**No Bitcoin wallet interaction required during redemption!** The Bitcoin transactions are signed and broadcast by the vault provider using the payout authorizations you signed during deposit.

### How to Redeem

**Example: AAVE Integration Controller**

```typescript
import { createWalletClient, custom } from "viem";
import { AaveIntegrationControllerABI } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave"; // ⚠️ Future package

async function redeemBTC(vaultId: string) {
  // Get Ethereum wallet client
  const ethWalletClient = createWalletClient({
    chain: sepolia,
    transport: custom(window.ethereum),
  });

  // Call AAVE-specific redemption function
  const txHash = await ethWalletClient.writeContract({
    address: AAVE_CONTROLLER_ADDRESS,
    abi: AaveIntegrationControllerABI,
    functionName: "depositorRedeem", // AAVE-specific function name
    args: [vaultId], // Your vault ID (peg-in tx hash)
  });

  console.log(`Redemption initiated! TX: ${txHash}`);
  console.log(
    "Vault provider will handle Bitcoin distribution using your pre-signed authorizations.",
  );

  return txHash;
}
```

**Note:** Function names and requirements vary by application. See the [Application-Specific Variations](#application-specific-variations) section below.

### What Happens After Redemption

1. **Contract status changes:** `ACTIVE` (2) → `REDEEMED` (3)
2. **Vault provider sees the redemption request** and retrieves your pre-signed payout authorization from Step 3 of peg-in
3. **Vault provider finalizes and broadcasts** the Bitcoin payout transaction using your signature
4. **BTC is sent** to the destination address specified in the payout transaction

### Application-Specific Variations

Different applications implement redemption with different function names and requirements:

| Application | Function Name     | Additional Requirements                  | Status        |
| ----------- | ----------------- | ---------------------------------------- | ------------- |
| **AAVE**    | `depositorRedeem` | Vault must not be collateralizing a loan | ✅ Production |
| **Morpho**  | `redeemBTCVault`  | Vault must not have outstanding debt     | ⚠️ Not in use |
| **Custom**  | Varies            | Depends on application logic             | Future        |

**Coming Soon:** Application-specific SDK packages will provide:

- Typed interfaces for each application's contracts
- Helper functions for redemption
- Business rule validation
- Integration with existing application SDKs

### Example: Redeem Multiple Vaults (Generic Pattern)

This example shows the pattern used in the vault service (application-agnostic):

```typescript
// From babylon-toolkit/services/vault/src/services/vault/vaultTransactionService.ts
async function redeemVaults(
  walletClient: WalletClient,
  chain: Chain,
  applicationController: Address,
  vaultIds: Hex[],
  contractABI: Abi,
  functionName: string, // e.g., "depositorRedeem" for AAVE
) {
  const results = [];

  for (const vaultId of vaultIds) {
    try {
      const txHash = await walletClient.writeContract({
        address: applicationController,
        abi: contractABI,
        functionName,
        args: [vaultId],
      });
      results.push({ vaultId, txHash, success: true });
    } catch (error) {
      results.push({
        vaultId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}
```

### Key Points

- ✅ **Redemption = Application-specific Ethereum transaction** (not part of core SDK)
- ✅ **Payout authorization (Step 3 of peg-in) = BTC pre-signing** (enables future redemption)
- ✅ **Vault provider handles Bitcoin side** using your pre-signed authorizations
- ✅ **No PayoutManager usage during redemption** - it was already used during peg-in Step 3
- ✅ **Function names vary by application** - check application documentation

---

## Error Handling

### Common Errors

| Error                          | Where                         | Cause                                      | Solution                                     |
| ------------------------------ | ----------------------------- | ------------------------------------------ | -------------------------------------------- |
| `Vault already exists`         | `registerPeginOnChain()`      | Vault ID is deterministic from transaction | Use different UTXOs or amount                |
| `Insufficient funds`           | `preparePegin()`              | Not enough UTXOs to cover amount + fees    | Add more UTXOs or reduce amount              |
| `Wallet account not found`     | Any manager method            | Wallet not connected                       | Prompt user to connect wallet                |
| `Invalid depositorBtcPubkey`   | `signAndBroadcast()`          | Pubkey wrong format                        | Use x-only format (64 hex chars, no prefix)  |
| `Transactions not ready`       | Payout authorization (Step 3) | Vault provider hasn't prepared txs yet     | Keep polling VP RPC until transactions ready |
| `Contract status not VERIFIED` | `signAndBroadcast()`          | Tried Step 4 before Step 3 completed       | Wait for vault provider to submit ACKs       |

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

**10+ manual steps** → **4 manager-orchestrated steps**

```typescript
// Before: ~300+ lines with manual UTXO selection, fee calculation, funding,
// proof-of-possession, contract encoding, payout signing, PSBT creation,
// signing, broadcasting

// After: ~100 lines with PeginManager + PayoutManager (see Complete Peg-In Example above)

// STEP 1: Prepare transaction
const pegin = await peginManager.preparePegin({...});

// STEP 2: Register on Ethereum
const { ethTxHash, vaultId } = await peginManager.registerPeginOnChain({...});

// STEP 3: Poll VP → Sign payout authorizations → Submit
const payoutManager = new PayoutManager({...});
// ... (poll for transactions, sign each, submit)

// STEP 4: Broadcast to Bitcoin
const btcTxid = await peginManager.signAndBroadcast({...});
```

**Migration steps:**

1. Replace UTXO selection/funding logic → `preparePegin()`
2. Replace PoP + contract call → `registerPeginOnChain()`
3. Add payout authorization step → `signPayoutTransaction()`
4. Replace PSBT creation/signing/broadcast → `signAndBroadcast()`
5. Update error handling for all 4 steps

See [Primitives Guide](./primitives.md) for the full primitives implementation.

---

## Next Steps

- **[API Reference](../api/managers.md)** - Complete API documentation for managers
- **[Primitives Guide](./primitives.md)** - Lower-level API for custom implementations
- **[Installation Guide](../get-started/installation.md)** - Setup and troubleshooting

## Need Help?

- [GitHub Issues](https://github.com/babylonlabs-io/babylon-toolkit/issues)
- [SDK Documentation](../../README.md)
