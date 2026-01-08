# Quickstart: Primitives API for Node.js

Complete guide to implementing Bitcoin TBV peg-in using **low-level Primitives only** in Node.js with custom wallet implementations.

## ⚠️ Important: What Primitives Are

**Primitives** are pure functions for **Bitcoin PSBT building ONLY**:

- ✅ `buildPeginPsbt()` - Build unfunded peg-in PSBT (0 inputs, 1 vault output)
- ✅ `buildPayoutPsbt()` - Build unsigned payout PSBT for depositor signing
- ✅ `extractPayoutSignature()` - Extract 64-byte Schnorr signature from signed PSBT

**Primitives do NOT provide:**

- ❌ Wallet integration or signing
- ❌ Ethereum contract interaction
- ❌ Proof-of-possession (PoP) generation
- ❌ Vault provider RPC polling or submission
- ❌ UTXO selection or fee calculation
- ❌ Transaction broadcasting
- ❌ Any orchestration or coordination logic

**You must implement ALL wallet operations, Ethereum interactions, RPC calls, and coordination logic yourself.**

## When to Use Primitives

Use primitives for custom implementations when you need:

- Backend services with custom signing (KMS/HSM)
- Full control over every operation
- Custom wallet integrations
- Serverless environments with specific requirements

**For complete peg-in orchestration with wallet integration**, use the [Managers Quickstart Guide](./managers.md) instead.

## Installation

```bash
npm install @babylonlabs-io/ts-sdk bitcoinjs-lib viem
```

## Prerequisites

### You Must Implement:

1. **Bitcoin Wallet** - Implements signing interface:

   ```typescript
   interface BitcoinWallet {
     getPublicKeyHex(): Promise<string>; // x-only pubkey (64 hex chars)
     signPsbt(psbtHex: string, options?: SignPsbtOptions): Promise<string>;
     signMessage(
       message: string,
       type: "bip322-simple" | "ecdsa",
     ): Promise<string>;
   }
   ```

2. **Ethereum Wallet** - viem WalletClient for contract calls

3. **Vault Provider RPC Client** - For polling and submitting signatures

4. **UTXO Management** - Selection, fee calculation, funding logic

5. **Transaction Broadcasting** - To Bitcoin network

## The 4-Step Peg-In Flow

### Step 1: Prepare Peg-In Transaction

Use `buildPeginPsbt()` to build an unfunded PSBT, then **YOU** fund, sign, and extract the transaction:

```typescript
import { buildPeginPsbt } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";
import { Psbt, Transaction } from "bitcoinjs-lib";
import type { Network } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";

// Step 1a: Build UNFUNDED PSBT using primitive
const peginResult = await buildPeginPsbt({
  depositorPubkey: "abc123...", // Your BTC pubkey (x-only, 64 hex chars, no 0x)
  claimerPubkey: "def456...", // Vault provider BTC pubkey (x-only, 64 hex chars)
  challengerPubkeys: ["ghi789...", "jkl012..."], // Liquidator BTC pubkeys (x-only, 64 hex chars each)
  pegInAmount: 100000n, // Amount in satoshis (bigint)
  network: "signet" as Network,
});

console.log("Vault script pubkey:", peginResult.vaultScriptPubKey);
console.log("Vault value:", peginResult.vaultValue);
console.log("Unfunded PSBT hex:", peginResult.psbtHex);

// Step 1b: YOU manually fund the transaction
// (Primitives don't do this - you must implement UTXO selection and fee calculation)
import * as bitcoin from "bitcoinjs-lib";

const network = bitcoin.networks.testnet; // For signet
const psbt = new Psbt({ network });

// Add your funding inputs (YOU select UTXOs, calculate fees)
const yourUtxos = [
  {
    txid: "abc123...",
    vout: 0,
    value: 200000n,
    scriptPubKey: "5120...",
  },
  // ... more UTXOs if needed
];

const feeRate = 10; // sat/vB - YOU determine this
const estimatedFee = 1000n; // YOU calculate based on inputs/outputs

// Add inputs
for (const utxo of yourUtxos) {
  psbt.addInput({
    hash: utxo.txid,
    index: utxo.vout,
    witnessUtxo: {
      script: Buffer.from(utxo.scriptPubKey, "hex"),
      value: Number(utxo.value),
    },
  });
}

// Add vault output (from primitives result)
psbt.addOutput({
  script: Buffer.from(peginResult.vaultScriptPubKey, "hex"),
  value: Number(peginResult.vaultValue),
});

// Add change output if needed
const totalInput = yourUtxos.reduce((sum, u) => sum + u.value, 0n);
const change = totalInput - peginResult.vaultValue - estimatedFee;
const DUST_THRESHOLD = 546n;

if (change > DUST_THRESHOLD) {
  psbt.addOutput({
    address: "tb1q...", // Your change address
    value: Number(change),
  });
}

// Step 1c: Sign with YOUR wallet and extract transaction hex
const signedPsbtHex = await btcWallet.signPsbt(psbt.toHex());
const signedPsbt = Psbt.fromHex(signedPsbtHex);
const fundedTxHex = signedPsbt.extractTransaction().toHex();

// Step 1d: Calculate vault ID using UTILITY function
import { calculateBtcTxHash } from "@babylonlabs-io/ts-sdk/tbv/core/utils";

const vaultId = calculateBtcTxHash(fundedTxHex); // Returns "0x..." format

console.log("Funded transaction hex:", fundedTxHex);
console.log("Vault ID:", vaultId);
```

**What primitives provide:** Unfunded PSBT with vault output only
**What YOU implement:** UTXO selection, fee calculation, funding, signing

### Step 2: Register on Ethereum

**YOU** generate proof-of-possession and submit to Ethereum contract:

```typescript
import {
  createWalletClient,
  createPublicClient,
  http,
  encodeFunctionData,
} from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// Step 2a: Generate BIP-322 proof-of-possession using YOUR wallet
// (Primitives don't provide this - you call wallet.signMessage directly)
const evmAccount = privateKeyToAccount("0x...");
const popMessage = `${evmAccount.address.toLowerCase()}:${sepolia.id}`;

const btcPopSignatureRaw = await btcWallet.signMessage(
  popMessage,
  "bip322-simple",
);

// Convert from base64 to hex (wallets return base64, contracts expect hex)
let btcPopSignature: string;
if (btcPopSignatureRaw.startsWith("0x")) {
  btcPopSignature = btcPopSignatureRaw;
} else {
  const signatureBytes = Buffer.from(btcPopSignatureRaw, "base64");
  btcPopSignature = `0x${signatureBytes.toString("hex")}`;
}

// Step 2b: Submit to BTCVaultsManager contract using viem
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});

const walletClient = createWalletClient({
  chain: sepolia,
  transport: http(),
  account: evmAccount,
});

// Format parameters
const depositorBtcPubkeyHex = depositorBtcPubkey.startsWith("0x")
  ? depositorBtcPubkey
  : `0x${depositorBtcPubkey}`;

const unsignedPegInTx = fundedTxHex.startsWith("0x")
  ? fundedTxHex
  : `0x${fundedTxHex}`;

// ABI for submitPeginRequest
const BTCVaultsManagerABI = [
  {
    inputs: [
      { name: "depositor", type: "address" },
      { name: "depositorBtcPubkey", type: "bytes32" },
      { name: "btcPopSignature", type: "bytes" },
      { name: "unsignedPegInTx", type: "bytes" },
      { name: "vaultProvider", type: "address" },
    ],
    name: "submitPeginRequest",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// Encode and send transaction
const callData = encodeFunctionData({
  abi: BTCVaultsManagerABI,
  functionName: "submitPeginRequest",
  args: [
    evmAccount.address, // depositor
    depositorBtcPubkeyHex, // depositorBtcPubkey
    btcPopSignature, // btcPopSignature
    unsignedPegInTx, // unsignedPegInTx
    "0xABC...", // vaultProvider (vault provider's Ethereum address)
  ],
});

const ethTxHash = await walletClient.sendTransaction({
  to: "0x123...", // BTCVaultsManager contract address
  data: callData,
  account: evmAccount,
  chain: sepolia,
});

console.log(`Registered on Ethereum! TX: ${ethTxHash}`);
console.log(`Vault ID: ${vaultId}`);

// Contract status is now PENDING (0)
```

**What primitives provide:** Nothing for this step
**What YOU implement:** PoP generation via wallet, Ethereum contract submission

### Step 3: Sign Payout Authorization

**YOU** poll vault provider, use primitives to build payout PSBTs, sign them, and submit:

```typescript
import {
  buildPayoutPsbt,
  extractPayoutSignature,
} from "@babylonlabs-io/ts-sdk/tbv/core/primitives";

// Step 3a: Poll vault provider RPC for claimer transactions (YOU implement polling)
const vpRpcUrl = "https://vp.example.com/rpc";

async function pollForClaimerTransactions(vaultId: string) {
  while (true) {
    try {
      const response = await fetch(vpRpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "vaultProvider_getPeginClaimTxGraph",
          params: [{ pegin_tx_id: vaultId.replace("0x", "") }],
          id: 1,
        }),
      });

      const result = await response.json();
      if (result.error) {
        throw new Error(result.error.message);
      }

      const graph = JSON.parse(result.result.graph_json);

      if (graph.claimer_transactions && graph.claimer_transactions.length > 0) {
        return graph.claimer_transactions;
      }
    } catch (error) {
      // Not ready yet, keep polling
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

const claimerTransactions = await pollForClaimerTransactions(vaultId);
console.log(`Found ${claimerTransactions.length} claimer transactions`);

// Step 3b: Build and sign each payout PSBT using PRIMITIVES
const signatures: Record<string, string> = {};

for (const claimerTx of claimerTransactions) {
  // Build unsigned payout PSBT using PRIMITIVE
  const payoutPsbtResult = await buildPayoutPsbt({
    payoutTxHex: claimerTx.payout_tx.tx_hex,
    peginTxHex: fundedTxHex,
    claimTxHex: claimerTx.claim_tx.tx_hex,
    depositorBtcPubkey: "abc123...", // Your BTC pubkey (x-only, 64 hex chars)
    vaultProviderBtcPubkey: "def456...", // Vault provider BTC pubkey
    liquidatorBtcPubkeys: ["ghi789...", "jkl012..."], // Liquidator BTC pubkeys
    network: "signet" as Network,
  });

  // Sign PSBT with YOUR wallet
  const signedPayoutPsbtHex = await btcWallet.signPsbt(
    payoutPsbtResult.psbtHex,
    {
      autoFinalized: false,
      signInputs: [
        {
          index: 0, // Only sign input 0 (vault UTXO)
          publicKey: depositorBtcPubkey, // Use compressed format if wallet expects it
          disableTweakSigner: true, // Required for Taproot script path spend
        },
      ],
    },
  );

  // Extract 64-byte Schnorr signature using PRIMITIVE
  const signature = extractPayoutSignature(
    signedPayoutPsbtHex,
    "abc123...", // depositorBtcPubkey (x-only, 64 hex chars)
  );

  // Convert claimer pubkey to x-only format
  const claimerPubkeyXOnly =
    claimerTx.claimer_pubkey.length === 66
      ? claimerTx.claimer_pubkey.substring(2)
      : claimerTx.claimer_pubkey;

  signatures[claimerPubkeyXOnly] = signature;
  console.log(`Signed for claimer: ${claimerPubkeyXOnly.slice(0, 8)}...`);
}

// Step 3c: Submit signatures to vault provider (YOU implement submission)
const submitResponse = await fetch(vpRpcUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    method: "vaultProvider_submitPayoutSignatures",
    params: [
      {
        pegin_tx_id: vaultId.replace("0x", ""),
        depositor_pk: "abc123...", // Your BTC pubkey (x-only, 64 hex chars, no 0x)
        signatures,
      },
    ],
    id: 2,
  }),
});

const submitResult = await submitResponse.json();
if (submitResult.error) {
  throw new Error(`Failed to submit signatures: ${submitResult.error.message}`);
}

console.log("Payout signatures submitted!");

// Contract status will change to VERIFIED (1) after vault provider submits acknowledgements
```

**What primitives provide:** `buildPayoutPsbt()` and `extractPayoutSignature()`
**What YOU implement:** VP polling, PSBT signing, signature submission

### Step 4: Broadcast to Bitcoin Network

**YOU** wait for VERIFIED status and broadcast the transaction:

```typescript
// Step 4a: Poll contract status until VERIFIED (YOU implement polling)
async function waitForVerifiedStatus(vaultId: string) {
  const BTCVaultsManagerABI = [
    {
      inputs: [{ name: "vaultId", type: "bytes32" }],
      name: "getBTCVault",
      outputs: [
        {
          components: [
            { name: "depositor", type: "address" },
            { name: "depositorBtcPubkey", type: "bytes32" },
            { name: "vaultProvider", type: "address" },
            { name: "status", type: "uint8" },
          ],
          type: "tuple",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
  ] as const;

  while (true) {
    const vault = await publicClient.readContract({
      address: "0x123...", // BTCVaultsManager contract address
      abi: BTCVaultsManagerABI,
      functionName: "getBTCVault",
      args: [vaultId],
    });

    // Status: 0=PENDING, 1=VERIFIED, 2=ACTIVE, 3=REDEEMED
    if (vault.status >= 1) {
      console.log("Vault is VERIFIED!");
      return;
    }

    console.log("Waiting for VERIFIED status...");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

await waitForVerifiedStatus(vaultId);

// Step 4b: Broadcast to Bitcoin network (YOU implement broadcasting)
const broadcastResponse = await fetch("https://mempool.space/signet/api/tx", {
  method: "POST",
  headers: { "Content-Type": "text/plain" },
  body: fundedTxHex,
});

if (!broadcastResponse.ok) {
  throw new Error(`Broadcast failed: ${await broadcastResponse.text()}`);
}

const txid = await broadcastResponse.text();
console.log(`Peg-in broadcasted! TXID: ${txid}`);
console.log(`View on mempool: https://mempool.space/signet/tx/${txid}`);

// Contract status will become ACTIVE (2) after Bitcoin confirmations + inclusion proof
```

**What primitives provide:** Nothing for this step
**What YOU implement:** Contract status polling, transaction broadcasting

## Complete Node.js Example

Here's a complete example showing all 4 steps with primitives:

```typescript
import {
  buildPeginPsbt,
  buildPayoutPsbt,
  extractPayoutSignature,
} from "@babylonlabs-io/ts-sdk/tbv/core/primitives";
import { calculateBtcTxHash } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import type { Network } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";
import { Psbt } from "bitcoinjs-lib";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
} from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// Configuration
const CONFIG = {
  btcNetwork: "signet" as Network,
  vaultProviderEthAddress: "0xABC...", // Vault provider's Ethereum address
  vaultProviderBtcPubkey: "def456...", // Vault provider's BTC pubkey (x-only, 64 chars)
  liquidatorBtcPubkeys: ["ghi789...", "jkl012..."], // Liquidator BTC pubkeys (x-only, 64 chars)
  btcVaultsManagerAddress: "0x123...", // BTCVaultsManager contract address
  vaultProviderRpcUrl: "https://vp.example.com/rpc",
  pegInAmount: 100000n,
};

async function completePeginFlow(
  btcWallet: BitcoinWallet,
  evmPrivateKey: string,
) {
  // Initialize Ethereum wallet
  const evmAccount = privateKeyToAccount(evmPrivateKey);
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(),
  });
  const walletClient = createWalletClient({
    chain: sepolia,
    transport: http(),
    account: evmAccount,
  });

  // Get depositor BTC pubkey
  const depositorBtcPubkey = await btcWallet.getPublicKeyHex();

  // ========================================
  // STEP 1: Prepare peg-in transaction
  // ========================================
  console.log("Step 1: Preparing peg-in transaction...");

  // Build unfunded PSBT using PRIMITIVE
  const peginResult = await buildPeginPsbt({
    depositorPubkey: depositorBtcPubkey,
    claimerPubkey: CONFIG.vaultProviderBtcPubkey,
    challengerPubkeys: CONFIG.liquidatorBtcPubkeys,
    pegInAmount: CONFIG.pegInAmount,
    network: CONFIG.btcNetwork,
  });

  // Manually fund the transaction (YOU implement this)
  const fundedTxHex = await fundAndSignTransaction(
    btcWallet,
    peginResult,
    CONFIG.pegInAmount,
  );

  // Calculate vault ID
  const vaultId = calculateBtcTxHash(fundedTxHex);
  console.log(`Vault ID: ${vaultId}`);

  // ========================================
  // STEP 2: Register on Ethereum
  // ========================================
  console.log("Step 2: Registering on Ethereum...");

  // Generate PoP
  const popMessage = `${evmAccount.address.toLowerCase()}:${sepolia.id}`;
  const btcPopSignatureRaw = await btcWallet.signMessage(
    popMessage,
    "bip322-simple",
  );

  const btcPopSignature = btcPopSignatureRaw.startsWith("0x")
    ? btcPopSignatureRaw
    : `0x${Buffer.from(btcPopSignatureRaw, "base64").toString("hex")}`;

  // Submit to contract
  const BTCVaultsManagerABI = [
    {
      inputs: [
        { name: "depositor", type: "address" },
        { name: "depositorBtcPubkey", type: "bytes32" },
        { name: "btcPopSignature", type: "bytes" },
        { name: "unsignedPegInTx", type: "bytes" },
        { name: "vaultProvider", type: "address" },
      ],
      name: "submitPeginRequest",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
  ] as const;

  const depositorBtcPubkeyHex = depositorBtcPubkey.startsWith("0x")
    ? depositorBtcPubkey
    : `0x${depositorBtcPubkey}`;

  const unsignedPegInTx = fundedTxHex.startsWith("0x")
    ? fundedTxHex
    : `0x${fundedTxHex}`;

  const callData = encodeFunctionData({
    abi: BTCVaultsManagerABI,
    functionName: "submitPeginRequest",
    args: [
      evmAccount.address,
      depositorBtcPubkeyHex,
      btcPopSignature,
      unsignedPegInTx,
      CONFIG.vaultProviderEthAddress,
    ],
  });

  const ethTxHash = await walletClient.sendTransaction({
    to: CONFIG.btcVaultsManagerAddress,
    data: callData,
    account: evmAccount,
    chain: sepolia,
  });

  console.log(`Registered! ETH TX: ${ethTxHash}`);

  // ========================================
  // STEP 3: Sign payout authorization
  // ========================================
  console.log("Step 3: Signing payout authorization...");

  // Poll for claimer transactions
  const claimerTransactions = await pollForClaimerTransactions(vaultId);
  console.log(`Found ${claimerTransactions.length} claimer transactions`);

  // Sign each payout
  const signatures: Record<string, string> = {};

  for (const claimerTx of claimerTransactions) {
    // Build payout PSBT using PRIMITIVE
    const payoutPsbtResult = await buildPayoutPsbt({
      payoutTxHex: claimerTx.payout_tx.tx_hex,
      peginTxHex: fundedTxHex,
      claimTxHex: claimerTx.claim_tx.tx_hex,
      depositorBtcPubkey,
      vaultProviderBtcPubkey: CONFIG.vaultProviderBtcPubkey,
      liquidatorBtcPubkeys: CONFIG.liquidatorBtcPubkeys,
      network: CONFIG.btcNetwork,
    });

    // Sign and extract signature using PRIMITIVE
    const signedPayoutPsbtHex = await btcWallet.signPsbt(
      payoutPsbtResult.psbtHex,
      {
        autoFinalized: false,
        signInputs: [
          {
            index: 0,
            publicKey: depositorBtcPubkey,
            disableTweakSigner: true,
          },
        ],
      },
    );

    const signature = extractPayoutSignature(
      signedPayoutPsbtHex,
      depositorBtcPubkey,
    );

    const claimerPubkeyXOnly =
      claimerTx.claimer_pubkey.length === 66
        ? claimerTx.claimer_pubkey.substring(2)
        : claimerTx.claimer_pubkey;

    signatures[claimerPubkeyXOnly] = signature;
  }

  // Submit signatures
  await submitPayoutSignatures(vaultId, depositorBtcPubkey, signatures);
  console.log("Payout signatures submitted!");

  // ========================================
  // STEP 4: Broadcast to Bitcoin
  // ========================================
  console.log("Step 4: Broadcasting to Bitcoin...");

  // Wait for VERIFIED status
  await waitForVerifiedStatus(publicClient, vaultId);

  // Broadcast
  const broadcastResponse = await fetch("https://mempool.space/signet/api/tx", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: fundedTxHex,
  });

  const txid = await broadcastResponse.text();
  console.log(`Success! TXID: ${txid}`);
  console.log(`View: https://mempool.space/signet/tx/${txid}`);

  return { vaultId, ethTxHash, txid };
}

// Helper functions (YOU implement these)
async function fundAndSignTransaction(
  btcWallet: BitcoinWallet,
  peginResult: any,
  amount: bigint,
): Promise<string> {
  // TODO: Implement UTXO selection, fee calculation, funding, and signing
  throw new Error("Not implemented");
}

async function pollForClaimerTransactions(vaultId: string): Promise<any[]> {
  // TODO: Implement VP RPC polling
  throw new Error("Not implemented");
}

async function submitPayoutSignatures(
  vaultId: string,
  depositorPk: string,
  signatures: Record<string, string>,
): Promise<void> {
  // TODO: Implement VP RPC submission
  throw new Error("Not implemented");
}

async function waitForVerifiedStatus(
  publicClient: any,
  vaultId: string,
): Promise<void> {
  // TODO: Implement contract status polling
  throw new Error("Not implemented");
}

// Run
completePeginFlow(yourBtcWallet, "0x...").catch(console.error);
```

## Key Concepts

| Concept                      | Description                                                  |
| ---------------------------- | ------------------------------------------------------------ |
| **Primitives**               | Pure Bitcoin PSBT builders - no wallet, no Ethereum, no RPC  |
| **buildPeginPsbt()**         | Build unfunded peg-in PSBT (0 inputs, 1 vault output)        |
| **buildPayoutPsbt()**        | Build unsigned payout PSBT for depositor signing             |
| **extractPayoutSignature()** | Extract 64-byte Schnorr signature from signed PSBT           |
| **Manual Orchestration**     | YOU implement all polling, state management, coordination    |
| **PoP Generation**           | Call `wallet.signMessage(message, "bip322-simple")` directly |
| **Vault ID**                 | `calculateBtcTxHash(fundedTxHex)` from utils                 |
| **Contract Status Flow**     | PENDING (0) → VERIFIED (1) → ACTIVE (2) → REDEEMED (3)       |

## What Primitives Provide

✅ `buildPeginPsbt()` - Build unfunded peg-in PSBT
✅ `buildPayoutPsbt()` - Build unsigned payout PSBT
✅ `extractPayoutSignature()` - Extract Schnorr signature from PSBT
✅ Pure functions, no side effects
✅ Works in Node.js, browsers, serverless

## What You Must Implement

❌ Wallet signing logic (PSBT, message signing)
❌ Ethereum contract interaction (using viem)
❌ Proof-of-possession generation (BIP-322 via wallet)
❌ Vault provider RPC polling and submission
❌ Contract status polling
❌ Transaction broadcasting to Bitcoin network
❌ UTXO selection and fee calculation
❌ Error handling and retry logic
❌ Application-specific redemption

## Helper Functions You Need

Here are example implementations for the helper functions referenced in the complete example:

### Poll Vault Provider for Claimer Transactions

```typescript
async function pollForClaimerTransactions(vaultId: string): Promise<any[]> {
  const vpRpcUrl = "https://vp.example.com/rpc";
  const maxRetries = 60; // 5 minutes with 5-second intervals
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const response = await fetch(vpRpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "vaultProvider_getPeginClaimTxGraph",
          params: [{ pegin_tx_id: vaultId.replace("0x", "") }],
          id: 1,
        }),
      });

      const result = await response.json();
      if (result.error) {
        throw new Error(result.error.message);
      }

      const graph = JSON.parse(result.result.graph_json);

      if (graph.claimer_transactions && graph.claimer_transactions.length > 0) {
        return graph.claimer_transactions;
      }
    } catch (error) {
      retries++;
      console.log(
        `Waiting for VP to prepare transactions... (${retries}/${maxRetries})`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error("Timeout waiting for vault provider to prepare transactions");
}
```

### Submit Payout Signatures to Vault Provider

```typescript
async function submitPayoutSignatures(
  vaultId: string,
  depositorPk: string,
  signatures: Record<string, string>,
): Promise<void> {
  const vpRpcUrl = "https://vp.example.com/rpc";

  const response = await fetch(vpRpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "vaultProvider_submitPayoutSignatures",
      params: [
        {
          pegin_tx_id: vaultId.replace("0x", ""),
          depositor_pk: depositorPk,
          signatures,
        },
      ],
      id: 2,
    }),
  });

  const result = await response.json();
  if (result.error) {
    throw new Error(`Failed to submit signatures: ${result.error.message}`);
  }
}
```

### Wait for Contract Status to Become VERIFIED

```typescript
async function waitForVerifiedStatus(
  publicClient: any,
  vaultId: string,
): Promise<void> {
  const BTCVaultsManagerABI = [
    {
      inputs: [{ name: "vaultId", type: "bytes32" }],
      name: "getBTCVault",
      outputs: [
        {
          components: [
            { name: "depositor", type: "address" },
            { name: "depositorBtcPubkey", type: "bytes32" },
            { name: "vaultProvider", type: "address" },
            { name: "status", type: "uint8" },
          ],
          type: "tuple",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
  ] as const;

  const maxRetries = 60; // 5 minutes
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const vault = await publicClient.readContract({
        address: "0x123...", // BTCVaultsManager contract address
        abi: BTCVaultsManagerABI,
        functionName: "getBTCVault",
        args: [vaultId],
      });

      // Status: 0=PENDING, 1=VERIFIED, 2=ACTIVE, 3=REDEEMED
      if (vault.status >= 1) {
        return;
      }
    } catch (error) {
      console.error("Error checking vault status:", error);
    }

    retries++;
    console.log(`Waiting for VERIFIED status... (${retries}/${maxRetries})`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error("Timeout waiting for vault to be verified");
}
```

### Fund and Sign Transaction

```typescript
import * as bitcoin from "bitcoinjs-lib";

async function fundAndSignTransaction(
  btcWallet: BitcoinWallet,
  peginResult: { vaultScriptPubKey: string; vaultValue: bigint },
  amount: bigint,
): Promise<string> {
  const network = bitcoin.networks.testnet; // For signet
  const psbt = new bitcoin.Psbt({ network });

  // Get UTXOs from your wallet or indexer
  const utxos = await fetchUtxos(btcWallet); // YOU implement this

  // Select UTXOs and calculate fee
  const { selectedUtxos, fee } = selectUtxosForAmount(
    utxos,
    amount,
    10, // feeRate in sat/vB
  ); // YOU implement this

  // Add inputs
  for (const utxo of selectedUtxos) {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: Buffer.from(utxo.scriptPubKey, "hex"),
        value: utxo.value,
      },
    });
  }

  // Add vault output
  psbt.addOutput({
    script: Buffer.from(peginResult.vaultScriptPubKey, "hex"),
    value: Number(peginResult.vaultValue),
  });

  // Add change output if needed
  const totalInput = selectedUtxos.reduce(
    (sum, u) => sum + BigInt(u.value),
    0n,
  );
  const change = totalInput - amount - fee;
  const DUST_THRESHOLD = 546n;

  if (change > DUST_THRESHOLD) {
    const changeAddress = await btcWallet.getAddress(); // YOU implement this
    psbt.addOutput({
      address: changeAddress,
      value: Number(change),
    });
  }

  // Sign and extract
  const signedPsbtHex = await btcWallet.signPsbt(psbt.toHex());
  const signedPsbt = bitcoin.Psbt.fromHex(signedPsbtHex);
  return signedPsbt.extractTransaction().toHex();
}
```

## Comparison: Primitives vs Managers

| Feature                      | Primitives               | Managers                           |
| ---------------------------- | ------------------------ | ---------------------------------- |
| **Bitcoin PSBT Building**    | ✅ You use primitives    | ✅ Uses primitives internally      |
| **Wallet Integration**       | ❌ You implement         | ✅ Built-in                        |
| **UTXO Selection**           | ❌ You implement         | ✅ Built-in                        |
| **Fee Calculation**          | ❌ You implement         | ✅ Built-in                        |
| **PoP Generation**           | ❌ You implement         | ✅ Built-in                        |
| **Ethereum Submission**      | ❌ You implement         | ✅ Built-in                        |
| **VP RPC Polling**           | ❌ You implement         | ✅ Built-in                        |
| **Transaction Broadcasting** | ❌ You implement         | ✅ Built-in                        |
| **Use Case**                 | Custom backends, KMS/HSM | Browser wallets, quick integration |

**For most applications**, use the [Managers Quickstart Guide](./managers.md) instead of primitives.

## Next Steps

- **[Managers Quickstart](./managers.md)** - High-level API with React + OKX Wallet
- **[Primitives Guide](../guides/primitives.md)** - Detailed API reference
- **[Managers Guide](../guides/managers.md)** - Complete orchestration documentation

## Troubleshooting

### "Cannot find module @babylonlabs-io/ts-sdk/tbv/core/primitives"

**Cause**: TypeScript or bundler doesn't support subpath exports.

**Solution**: Upgrade TypeScript to 4.7+ or configure modern module resolution:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler"
  }
}
```

### "WASM module not loaded"

**Cause**: WASM initialization failed.

**Solution**: Ensure proper WASM loading in your bundler (see [Installation Guide](../get-started/installation.md)).

### "Invalid depositor pubkey"

**Cause**: Pubkey format is wrong.

**Solution**: Use x-only format (64 hex chars, no 0x prefix). If wallet returns compressed format (66 chars), strip the first byte:

```typescript
const xOnlyPubkey =
  compressedPubkey.length === 66 ? compressedPubkey.slice(2) : compressedPubkey;
```

### "Vault already exists"

**Cause**: Vault IDs are deterministic from the transaction.

**Solution**: Use different UTXOs or amount to create a unique transaction.

## Resources

- [GitHub Repository](https://github.com/babylonlabs-io/babylon-toolkit)
- [GitHub Issues](https://github.com/babylonlabs-io/babylon-toolkit/issues)
- [Primitives API Reference](../api/primitives.md)
