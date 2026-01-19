# Quickstart: Managers API with OKX Wallet

Complete guide to implementing Bitcoin TBV peg-in using high-level Managers in a React application with OKX Wallet browser extension.

## Prerequisites

### 1. Install the SDK

```bash
npm install @babylonlabs-io/ts-sdk viem
```

### 2. Install OKX Wallet Browser Extension

- [Chrome Web Store](https://chrome.google.com/webstore/detail/okx-wallet/mcohilncbfahbmgdjkbpemcciiolgcge)

The OKX Wallet provides both Bitcoin and Ethereum signing capabilities through browser APIs.

## Wallet Setup

### Bitcoin Wallet (Signet)

OKX Wallet exposes a Bitcoin Signet provider via `window.okxwallet.bitcoinSignet`:

```typescript
// Access OKX Bitcoin Signet provider
const btcWallet = window.okxwallet.bitcoinSignet;

// The provider implements the BitcoinWallet interface:
// - getPublicKeyHex(): Promise<string>
// - getAddress(): Promise<string>
// - signPsbt(psbtHex: string, options?: SignPsbtOptions): Promise<string>
// - signMessage(message: string, type: "bip322-simple" | "ecdsa"): Promise<string>
// - getNetwork(): Promise<BitcoinNetwork>
```

**Documentation**: [OKX Bitcoin Provider (Signet)](https://web3.okx.com/build/dev-docs/sdks/chains/bitcoin/provider-signet)

### Ethereum Wallet (Sepolia)

OKX Wallet exposes an Ethereum provider via `window.okxwallet.ethereum`:

```typescript
import { createWalletClient, custom } from "viem";
import { sepolia } from "viem/chains";

// Create viem WalletClient using OKX Ethereum provider
const ethWallet = createWalletClient({
  chain: sepolia,
  transport: custom(window.okxwallet.ethereum),
});
```

**Documentation**: [OKX EVM Provider](https://web3.okx.com/build/dev-docs/sdks/chains/evm/introduce)

## The 4-Step Peg-In Flow

### Overview

The complete peg-in flow consists of 4 steps:

1. **Prepare** - Build and fund the Bitcoin transaction
2. **Register** - Submit to Ethereum contract with proof-of-possession
3. **Sign Payout Authorization** - Pre-authorize future fund distribution
4. **Broadcast** - Sign and broadcast to Bitcoin network

### Step 1: Prepare Peg-In Transaction

Build and fund the Bitcoin transaction using `PeginManager.preparePegin()`:

```typescript
import { PeginManager } from "@babylonlabs-io/ts-sdk/tbv/core";
import { createWalletClient, custom } from "viem";
import { sepolia } from "viem/chains";

// Initialize wallets
const btcWallet = window.okxwallet.bitcoinSignet;
const ethWallet = createWalletClient({
  chain: sepolia,
  transport: custom(window.okxwallet.ethereum),
});

// Create PeginManager with full configuration
const peginManager = new PeginManager({
  btcNetwork: "signet",
  btcWallet,
  ethWallet,
  ethChain: sepolia,
  vaultContracts: {
    btcVaultsManager: "0x123...", // BTCVaultsManager contract address
  },
  mempoolApiUrl: "https://mempool.space/signet/api",
});

// Prepare transaction with automatic UTXO selection
const result = await peginManager.preparePegin({
  amount: 100000n, // Amount in satoshis (bigint)
  vaultProvider: "0xABC...", // Vault provider's Ethereum address
  vaultProviderBtcPubkey: "abc...", // From vault provider (x-only, 64 hex chars)
  vaultKeeperBtcPubkeys: ["def...", "ghi..."], // From indexer (x-only, 64 hex chars each)
  availableUTXOs: [
    {
      txid: "abc123...",
      vout: 0,
      value: 200000n,
      scriptPubKey: "5120...",
    },
    // ... more UTXOs
  ],
  feeRate: 10, // Fee rate in sat/vB
  changeAddress: "tb1q...", // Your Bitcoin change address
});

// Save for later steps
const { fundedTxHex, btcTxHash, selectedUTXOs, fee, changeAmount } = result;

console.log(`Transaction prepared!`);
console.log(`BTC TX Hash: ${btcTxHash}`);
console.log(`Fee: ${fee} sats`);
console.log(`Change: ${changeAmount} sats`);
```

**What happens internally:**

1. Gets depositor BTC public key from wallet
2. Builds unfunded PSBT using primitives
3. Selects UTXOs using iterative fee calculation
4. Funds transaction by adding inputs and change output

### Step 2: Register on Ethereum

Submit peg-in request to Ethereum contract with proof-of-possession:

```typescript
// Get depositor BTC pubkey (x-only format, 64 hex chars)
const depositorBtcPubkeyRaw = await btcWallet.getPublicKeyHex();
const depositorBtcPubkey =
  depositorBtcPubkeyRaw.length === 66
    ? depositorBtcPubkeyRaw.slice(2) // Strip 02/03 prefix if compressed
    : depositorBtcPubkeyRaw; // Already x-only

// Submit to contract using PeginManager
const { ethTxHash, vaultId } = await peginManager.registerPeginOnChain({
  depositorBtcPubkey,
  unsignedBtcTx: fundedTxHex,
  vaultProvider: "0xABC...", // Vault provider's Ethereum address
  onPopSigned: () => {
    // Optional callback after BTC signature (PoP) but before ETH transaction
    console.log("PoP signature complete, requesting ETH signature...");
  },
});

console.log(`Registered! Vault ID: ${vaultId}`);
console.log(`Ethereum TX: ${ethTxHash}`);

// Contract status is now PENDING (0)
```

**What happens internally:**

1. Gets depositor ETH address from wallet
2. Creates proof-of-possession (BTC signature of ETH address using BIP-322)
3. Checks if vault already exists (pre-flight check)
4. Encodes contract call using viem
5. Sends transaction via `ethWallet.sendTransaction()`

**Important:** After Step 2, the vault contract status is `PENDING`. You must complete Step 3 before proceeding to Step 4.

### Step 3: Sign Payout Authorization

Wait for vault provider to prepare claim/payout transactions, then sign them:

```typescript
import { PayoutManager } from "@babylonlabs-io/ts-sdk/tbv/core";

// Create a simple RPC client (you can also use @babylonlabs-io/ts-sdk/tbv/clients)
class VaultProviderRpcClient {
  constructor(private baseUrl: string) {}

  async getPeginClaimTxGraph(params: { pegin_tx_id: string }) {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "vaultProvider_getPeginClaimTxGraph",
        params: [params],
        id: 1,
      }),
    });
    const json = await response.json();
    if (json.error) throw new Error(json.error.message);
    return json.result;
  }

  async submitPayoutSignatures(params: {
    pegin_tx_id: string;
    depositor_pk: string;
    signatures: Record<string, { payout_optimistic_signature: string; payout_signature: string }>;
  }) {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "vaultProvider_submitPayoutSignatures",
        params: [params],
        id: 2,
      }),
    });
    const json = await response.json();
    if (json.error) throw new Error(json.error.message);
    return json.result;
  }
}

// Initialize vault provider RPC client
const vpRpcClient = new VaultProviderRpcClient("https://vp.example.com/rpc");

// Poll for claimer transactions (vault provider prepares these)
let claimerTransactions;
let retries = 0;
const maxRetries = 60; // 5 minutes with 5-second intervals

while (!claimerTransactions && retries < maxRetries) {
  try {
    const response = await vpRpcClient.getPeginClaimTxGraph({
      pegin_tx_id: vaultId.replace("0x", ""),
    });
    const graph = JSON.parse(response.graph_json);
    claimerTransactions = graph.claimer_transactions;

    if (!claimerTransactions || claimerTransactions.length === 0) {
      throw new Error("Transactions not ready yet");
    }
  } catch (error) {
    retries++;
    console.log(
      `Waiting for vault provider to prepare transactions... (${retries}/${maxRetries})`,
    );
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

if (!claimerTransactions) {
  throw new Error("Timeout waiting for vault provider to prepare transactions");
}

// Create PayoutManager
const payoutManager = new PayoutManager({
  network: "signet",
  btcWallet,
});

// Sign BOTH payout authorization transactions for each claimer
interface ClaimerSignatures {
  payout_optimistic_signature: string;
  payout_signature: string;
}

const signatures: Record<string, ClaimerSignatures> = {};

for (const claimerTx of claimerTransactions) {
  // Sign PayoutOptimistic (optimistic path - no challenge)
  const { signature: payoutOptimisticSig } = await payoutManager.signPayoutOptimisticTransaction({
    payoutOptimisticTxHex: claimerTx.payout_optimistic_tx.tx_hex,
    peginTxHex: fundedTxHex,
    claimTxHex: claimerTx.claim_tx.tx_hex,
    vaultProviderBtcPubkey: "abc...",
    vaultKeeperBtcPubkeys: ["def..."],
    universalChallengerBtcPubkeys: ["ghi..."],
    depositorBtcPubkey,
  });

  // Sign Payout (challenge path - after Assert)
  const { signature: payoutSig } = await payoutManager.signPayoutTransaction({
    payoutTxHex: claimerTx.payout_tx.tx_hex,
    peginTxHex: fundedTxHex,
    assertTxHex: claimerTx.assert_tx.tx_hex,
    vaultProviderBtcPubkey: "abc...",
    vaultKeeperBtcPubkeys: ["def..."],
    universalChallengerBtcPubkeys: ["ghi..."],
    depositorBtcPubkey,
  });

  // Vault provider expects x-only pubkeys (64 hex chars, no 0x prefix)
  const claimerPubkeyXOnly =
    claimerTx.claimer_pubkey.length === 66
      ? claimerTx.claimer_pubkey.substring(2) // Strip 02/03 prefix
      : claimerTx.claimer_pubkey; // Already x-only

  signatures[claimerPubkeyXOnly] = {
    payout_optimistic_signature: payoutOptimisticSig,
    payout_signature: payoutSig,
  };
  console.log(
    `Signed BOTH payout authorizations for claimer: ${claimerPubkeyXOnly.slice(0, 8)}...`,
  );
}

// Submit BOTH signatures to vault provider
await vpRpcClient.submitPayoutSignatures({
  pegin_tx_id: vaultId.replace("0x", ""),
  depositor_pk: depositorBtcPubkey,
  signatures,
});

console.log("Payout signatures submitted!");
console.log("Waiting for vault provider to acknowledge...");

// Contract status will change to VERIFIED (1) after vault provider submits acknowledgements
```

**What happens internally:**

1. Gets depositor BTC public key from wallet and converts to x-only format
2. Validates wallet pubkey matches on-chain depositor pubkey
3. For PayoutOptimistic: Builds unsigned PSBT using `buildPayoutOptimisticPsbt()` primitive
4. For Payout: Builds unsigned PSBT using `buildPayoutPsbt()` primitive
5. Signs both PSBTs via `btcWallet.signPsbt()`
6. Extracts 64-byte Schnorr signatures using `extractPayoutSignature()` primitive

**What you're signing:**

- **PayoutOptimistic**: Optimistic path (Claim → PayoutOptimistic) - faster, cheaper if no challenge
- **Payout**: Challenge path (Claim → Assert → Payout) - secure fallback if challenged

**Important:** After Step 3, wait for the vault provider to submit acknowledgements on-chain. The vault contract status will change from `PENDING` (0) → `VERIFIED` (1). Only then can you proceed to Step 4.

### Step 4: Broadcast to Bitcoin Network

Wait for contract status to become `VERIFIED`, then sign and broadcast:

```typescript
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

// Create public client for reading contract state
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});

// ABI for reading vault status
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
          // ... other fields
        ],
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Wait for contract status to become VERIFIED (1)
let status = 0;
let statusRetries = 0;
const maxStatusRetries = 60; // 5 minutes

while (status < 1 && statusRetries < maxStatusRetries) {
  try {
    const vault = await publicClient.readContract({
      address: "0x123...", // BTCVaultsManager address
      abi: BTCVaultsManagerABI,
      functionName: "getBTCVault",
      args: [vaultId],
    });
    status = vault.status; // 0=PENDING, 1=VERIFIED, 2=ACTIVE, 3=REDEEMED

    if (status < 1) {
      statusRetries++;
      console.log(
        `Waiting for VERIFIED status... (${statusRetries}/${maxStatusRetries})`,
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  } catch (error) {
    statusRetries++;
    console.error("Error checking vault status:", error);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

if (status < 1) {
  throw new Error("Timeout waiting for vault to be verified");
}

console.log("Vault is VERIFIED! Broadcasting to Bitcoin...");

// Now broadcast to Bitcoin
const btcTxid = await peginManager.signAndBroadcast({
  fundedTxHex,
  depositorBtcPubkey,
});

console.log(`Peg-in broadcasted! TXID: ${btcTxid}`);
console.log(`View on mempool: https://mempool.space/signet/tx/${btcTxid}`);

// Contract status will become ACTIVE (2) after Bitcoin confirmations + inclusion proof
```

**What happens internally:**

1. Parses the funded transaction
2. Fetches UTXO data from mempool API for each input
3. Creates PSBT with proper `witnessUtxo` and `tapInternalKey`
4. Signs via `btcWallet.signPsbt()`
5. Finalizes and extracts transaction
6. Broadcasts via mempool API

## Complete React Component Example

Here's a complete React component that implements the entire 4-step peg-in flow:

```typescript
import { useState } from "react";
import { PeginManager, PayoutManager } from "@babylonlabs-io/ts-sdk/tbv/core";
import { createPublicClient, createWalletClient, http, custom } from "viem";
import { sepolia } from "viem/chains";

// Vault provider RPC client (simplified)
class VaultProviderRpcClient {
  constructor(private baseUrl: string) {}

  async getPeginClaimTxGraph(params: { pegin_tx_id: string }) {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "vaultProvider_getPeginClaimTxGraph",
        params: [params],
        id: 1,
      }),
    });
    const json = await response.json();
    if (json.error) throw new Error(json.error.message);
    return json.result;
  }

  async submitPayoutSignatures(params: {
    pegin_tx_id: string;
    depositor_pk: string;
    signatures: Record<string, { payout_optimistic_signature: string; payout_signature: string }>;
  }) {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "vaultProvider_submitPayoutSignatures",
        params: [params],
        id: 2,
      }),
    });
    const json = await response.json();
    if (json.error) throw new Error(json.error.message);
    return json.result;
  }
}

// Configuration
const CONFIG = {
  btcVaultsManager: "0x123...", // BTCVaultsManager contract address
  vaultProvider: "0xABC...", // Vault provider's Ethereum address
  vaultProviderBtcPubkey: "abc...", // Vault provider's BTC pubkey (x-only, 64 chars)
  vaultKeeperBtcPubkeys: ["def..."], // Vault keeper BTC pubkeys (x-only, 64 chars)
  universalChallengerBtcPubkeys: ["ghi..."], // Universal challenger BTC pubkeys (x-only, 64 chars)
  vaultProviderRpcUrl: "https://vp.example.com/rpc",
};

export function PeginFlow() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [vaultId, setVaultId] = useState<string>("");
  const [fundedTxHex, setFundedTxHex] = useState<string>("");
  const [depositorBtcPubkey, setDepositorBtcPubkey] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  const handleStep1 = async () => {
    setLoading(true);
    setError(null);
    setStatus("Preparing transaction...");

    try {
      const btcWallet = window.okxwallet.bitcoinSignet;
      const ethWallet = createWalletClient({
        chain: sepolia,
        transport: custom(window.okxwallet.ethereum),
      });

      const peginManager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet,
        ethChain: sepolia,
        vaultContracts: {
          btcVaultsManager: CONFIG.btcVaultsManager,
        },
        mempoolApiUrl: "https://mempool.space/signet/api",
      });

      // Get UTXOs (you would fetch these from your wallet or indexer)
      const availableUTXOs = [
        {
          txid: "abc123...",
          vout: 0,
          value: 200000n,
          scriptPubKey: "5120...",
        },
      ];

      const result = await peginManager.preparePegin({
        amount: 100000n,
        vaultProvider: CONFIG.vaultProvider,
        vaultProviderBtcPubkey: CONFIG.vaultProviderBtcPubkey,
        vaultKeeperBtcPubkeys: CONFIG.vaultKeeperBtcPubkeys,
        availableUTXOs,
        feeRate: 10,
        changeAddress: await btcWallet.getAddress(),
      });

      setFundedTxHex(result.fundedTxHex);
      setStatus(`Transaction prepared! Fee: ${result.fee} sats`);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleStep2 = async () => {
    setLoading(true);
    setError(null);
    setStatus("Registering on Ethereum...");

    try {
      const btcWallet = window.okxwallet.bitcoinSignet;
      const ethWallet = createWalletClient({
        chain: sepolia,
        transport: custom(window.okxwallet.ethereum),
      });

      const peginManager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet,
        ethChain: sepolia,
        vaultContracts: {
          btcVaultsManager: CONFIG.btcVaultsManager,
        },
        mempoolApiUrl: "https://mempool.space/signet/api",
      });

      // Get depositor BTC pubkey
      const depositorBtcPubkeyRaw = await btcWallet.getPublicKeyHex();
      const pubkey = depositorBtcPubkeyRaw.length === 66
        ? depositorBtcPubkeyRaw.slice(2)
        : depositorBtcPubkeyRaw;

      const { ethTxHash, vaultId: vid } = await peginManager.registerPeginOnChain({
        depositorBtcPubkey: pubkey,
        unsignedBtcTx: fundedTxHex,
        vaultProvider: CONFIG.vaultProvider,
        onPopSigned: () => {
          setStatus("PoP signed, requesting Ethereum signature...");
        },
      });

      setVaultId(vid);
      setDepositorBtcPubkey(pubkey);
      setStatus(`Registered! Vault ID: ${vid}, ETH TX: ${ethTxHash}`);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleStep3 = async () => {
    setLoading(true);
    setError(null);
    setStatus("Waiting for vault provider...");

    try {
      const btcWallet = window.okxwallet.bitcoinSignet;
      const vpRpcClient = new VaultProviderRpcClient(CONFIG.vaultProviderRpcUrl);

      // Poll for claimer transactions
      let claimerTransactions;
      let retries = 0;
      const maxRetries = 60;

      while (!claimerTransactions && retries < maxRetries) {
        try {
          const response = await vpRpcClient.getPeginClaimTxGraph({
            pegin_tx_id: vaultId.replace("0x", ""),
          });
          const graph = JSON.parse(response.graph_json);
          claimerTransactions = graph.claimer_transactions;

          if (!claimerTransactions || claimerTransactions.length === 0) {
            throw new Error("Not ready");
          }
        } catch {
          retries++;
          setStatus(`Waiting for vault provider... (${retries}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

      if (!claimerTransactions) {
        throw new Error("Timeout waiting for vault provider");
      }

      setStatus("Signing payout authorizations...");

      // Sign BOTH payout authorizations (PayoutOptimistic and Payout)
      const payoutManager = new PayoutManager({ network: "signet", btcWallet });
      const signatures: Record<string, { payout_optimistic_signature: string; payout_signature: string }> = {};

      for (const claimerTx of claimerTransactions) {
        // Sign PayoutOptimistic (optimistic path)
        const { signature: payoutOptimisticSig } = await payoutManager.signPayoutOptimisticTransaction({
          payoutOptimisticTxHex: claimerTx.payout_optimistic_tx.tx_hex,
          peginTxHex: fundedTxHex,
          claimTxHex: claimerTx.claim_tx.tx_hex,
          vaultProviderBtcPubkey: CONFIG.vaultProviderBtcPubkey,
          vaultKeeperBtcPubkeys: CONFIG.vaultKeeperBtcPubkeys,
          universalChallengerBtcPubkeys: CONFIG.universalChallengerBtcPubkeys,
          depositorBtcPubkey,
        });

        // Sign Payout (challenge path)
        const { signature: payoutSig } = await payoutManager.signPayoutTransaction({
          payoutTxHex: claimerTx.payout_tx.tx_hex,
          peginTxHex: fundedTxHex,
          assertTxHex: claimerTx.assert_tx.tx_hex,
          vaultProviderBtcPubkey: CONFIG.vaultProviderBtcPubkey,
          vaultKeeperBtcPubkeys: CONFIG.vaultKeeperBtcPubkeys,
          universalChallengerBtcPubkeys: CONFIG.universalChallengerBtcPubkeys,
          depositorBtcPubkey,
        });

        const claimerPubkeyXOnly = claimerTx.claimer_pubkey.length === 66
          ? claimerTx.claimer_pubkey.substring(2)
          : claimerTx.claimer_pubkey;

        signatures[claimerPubkeyXOnly] = {
          payout_optimistic_signature: payoutOptimisticSig,
          payout_signature: payoutSig,
        };
      }

      setStatus("Submitting signatures...");

      // Submit signatures
      await vpRpcClient.submitPayoutSignatures({
        pegin_tx_id: vaultId.replace("0x", ""),
        depositor_pk: depositorBtcPubkey,
        signatures,
      });

      setStatus("Signatures submitted! Waiting for verification...");
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleStep4 = async () => {
    setLoading(true);
    setError(null);
    setStatus("Waiting for VERIFIED status...");

    try {
      const btcWallet = window.okxwallet.bitcoinSignet;
      const ethWallet = createWalletClient({
        chain: sepolia,
        transport: custom(window.okxwallet.ethereum),
      });

      const peginManager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet,
        ethChain: sepolia,
        vaultContracts: {
          btcVaultsManager: CONFIG.btcVaultsManager,
        },
        mempoolApiUrl: "https://mempool.space/signet/api",
      });

      // Wait for VERIFIED status
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(),
      });

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

      let vaultStatus = 0;
      let statusRetries = 0;
      const maxStatusRetries = 60;

      while (vaultStatus < 1 && statusRetries < maxStatusRetries) {
        try {
          const vault = await publicClient.readContract({
            address: CONFIG.btcVaultsManager,
            abi: BTCVaultsManagerABI,
            functionName: "getBTCVault",
            args: [vaultId],
          });
          vaultStatus = vault.status;

          if (vaultStatus < 1) {
            statusRetries++;
            setStatus(`Waiting for VERIFIED status... (${statusRetries}/${maxStatusRetries})`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        } catch {
          statusRetries++;
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

      if (vaultStatus < 1) {
        throw new Error("Timeout waiting for vault verification");
      }

      setStatus("Broadcasting to Bitcoin...");

      const btcTxid = await peginManager.signAndBroadcast({
        fundedTxHex,
        depositorBtcPubkey,
      });

      setStatus(`Success! TXID: ${btcTxid}`);
      console.log(`View on mempool: https://mempool.space/signet/tx/${btcTxid}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "monospace" }}>
      <h1>Bitcoin TBV Peg-In Flow</h1>

      <div style={{ marginBottom: "20px" }}>
        <div>Current Step: {step} of 4</div>
        <div>Status: {status || "Ready"}</div>
        {error && <div style={{ color: "red" }}>Error: {error}</div>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {step === 1 && (
          <button onClick={handleStep1} disabled={loading}>
            {loading ? "Preparing..." : "Step 1: Prepare Transaction"}
          </button>
        )}
        {step === 2 && (
          <button onClick={handleStep2} disabled={loading}>
            {loading ? "Registering..." : "Step 2: Register on Ethereum"}
          </button>
        )}
        {step === 3 && (
          <button onClick={handleStep3} disabled={loading}>
            {loading ? "Signing..." : "Step 3: Sign Payout Authorization"}
          </button>
        )}
        {step === 4 && (
          <button onClick={handleStep4} disabled={loading}>
            {loading ? "Broadcasting..." : "Step 4: Broadcast to Bitcoin"}
          </button>
        )}
      </div>

      {vaultId && (
        <div style={{ marginTop: "20px" }}>
          <div>Vault ID: {vaultId}</div>
        </div>
      )}
    </div>
  );
}
```

## Key Concepts

| Concept                  | Description                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| **PeginManager**         | Handles Steps 1, 2, and 4 (prepare, register, broadcast)                                    |
| **PayoutManager**        | Handles Step 3 (sign payout authorization during peg-in)                                    |
| **Payout Authorization** | NOT redemption/withdrawal - pre-authorizes future fund distribution as part of deposit      |
| **Contract Status Flow** | PENDING (0) → VERIFIED (1) → ACTIVE (2) → REDEEMED (3)                                      |
| **OKX Wallet**           | `window.okxwallet.bitcoinSignet` for BTC, `window.okxwallet.ethereum` for EVM               |
| **x-only pubkeys**       | 32-byte public keys (64 hex chars) used in Taproot, strip first byte from compressed format |

## What Managers Provide

✅ Wallet integration (BTC and EVM signing)
✅ Proof-of-possession generation (BIP-322)
✅ Ethereum contract interaction
✅ PSBT building and signing
✅ Transaction broadcasting
✅ Complete peg-in orchestration

## What You Must Implement

❌ UTXO fetching (from wallet or indexer)
❌ Vault provider RPC polling logic
❌ Contract status polling logic
❌ Application-specific redemption (AAVE, Morpho, etc.)
❌ Vault provider and vault keeper discovery (use indexer/subgraph)

## TypeScript Types

Make sure to add TypeScript declarations for OKX Wallet:

```typescript
// global.d.ts
interface Window {
  okxwallet: {
    bitcoinSignet: {
      getPublicKeyHex(): Promise<string>;
      getAddress(): Promise<string>;
      signPsbt(psbtHex: string, options?: any): Promise<string>;
      signMessage(
        message: string,
        type: "bip322-simple" | "ecdsa",
      ): Promise<string>;
      getNetwork(): Promise<string>;
    };
    ethereum: any; // EIP-1193 provider
  };
}
```

## Next Steps

- **[Full Managers Guide](../guides/managers.md)** - Detailed API documentation with all parameters and return types
- **[Installation Guide](../get-started/installation.md)** - Setup, troubleshooting, and verification
- **[Primitives Quickstart](./primitives.md)** - Lower-level API for Node.js and custom implementations
- **Redemption Flow** - Application-specific (AAVE uses `depositorRedeem()`, Morpho uses `redeemBTCVault()`)

## Troubleshooting

### "window.okxwallet is undefined"

**Cause**: OKX Wallet extension not installed.

**Solution**:

1. Install [OKX Wallet extension](https://chrome.google.com/webstore/detail/okx-wallet/mcohilncbfahbmgdjkbpemcciiolgcge)
2. Refresh the page
3. Connect wallet to your site
4. Check that wallet is on Signet network for Bitcoin

### "Vault already exists"

**Cause**: Vault IDs are deterministic - same UTXOs + amount = same vault ID.

**Solution**: Use different UTXOs or a different amount to create a new vault.

### "Timeout waiting for vault provider"

**Cause**: Vault provider hasn't prepared claim/payout transactions yet.

**Solution**: Wait longer or contact vault provider. This can take 1-5 minutes after Step 2.

### "Contract status not verified"

**Cause**: Tried Step 4 before vault provider submitted acknowledgements.

**Solution**: Wait for contract status to become VERIFIED (1) before broadcasting to Bitcoin.

## Resources

- [OKX Bitcoin Provider (Signet)](https://web3.okx.com/build/dev-docs/sdks/chains/bitcoin/provider-signet)
- [OKX EVM Provider](https://web3.okx.com/build/dev-docs/sdks/chains/evm/introduce)
- [GitHub Repository](https://github.com/babylonlabs-io/babylon-toolkit)
- [GitHub Issues](https://github.com/babylonlabs-io/babylon-toolkit/issues)
