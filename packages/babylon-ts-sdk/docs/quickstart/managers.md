# Managers

High-level orchestration for multi-step vault operations.

> For complete function signatures, see [API Reference](../api/managers.md).

## What Are Managers?

Managers orchestrate complex flows that involve multiple steps across Bitcoin and Ethereum. They:

- Accept wallet interfaces (you provide the wallet implementation)
- Handle multi-step coordination (PSBT building, signing, contract calls)
- Work in browser or Node.js (framework-agnostic)

## When to Use Managers vs Primitives

| Use Case                              | Use          |
| ------------------------------------- | ------------ |
| Browser app with standard wallet      | **Managers** |
| Quick integration, less code          | **Managers** |
| Backend with custom signing (KMS/HSM) | Primitives   |
| Need full control over every step     | Primitives   |

---

## PeginManager

Orchestrates BTC vault creation (peg-in flow).

### What It Does

1. Builds funded Bitcoin transaction with vault output
2. Registers vault on Ethereum (with proof-of-possession)
3. Signs payout authorization (pre-authorizes future fund distribution)
4. Signs and broadcasts to Bitcoin network

### Configuration

```typescript
import { PeginManager } from "@babylonlabs-io/ts-sdk/tbv/core";

const peginManager = new PeginManager({
  btcNetwork: "signet", // Bitcoin network
  btcWallet, // Your BitcoinWallet implementation
  ethWallet, // viem WalletClient
  ethChain: sepolia, // viem Chain
  vaultContracts: {
    btcVaultsManager: "0x...", // Contract address
  },
  mempoolApiUrl: "https://mempool.space/signet/api",
});
```

### 4-Step Flow

```typescript
import { PayoutManager } from "@babylonlabs-io/ts-sdk/tbv/core";

// Step 1: Prepare transaction (builds funded tx, selects UTXOs)
const result = await peginManager.preparePegin({
  amount: 100000n, // satoshis
  vaultProvider: "0x...", // Vault provider ETH address
  vaultProviderBtcPubkey: "abc123...", // x-only, 64 hex chars
  vaultKeeperBtcPubkeys: ["def456..."], // x-only pubkeys
  universalChallengerBtcPubkeys: ["ghi789..."],
  availableUTXOs, // Your UTXOs
  feeRate: 10, // sat/vB
  changeAddress: "tb1q...", // Your change address
});

console.log("Vault ID:", result.btcTxHash);
console.log("Fee:", result.fee, "satoshis");

// Step 2: Register on Ethereum (generates PoP, submits to contract)
const { ethTxHash, vaultId } = await peginManager.registerPeginOnChain({
  depositorBtcPubkey: "...",
  unsignedBtcTx: result.fundedTxHex,
  vaultProvider: "0x...",
});

console.log("Registered:", ethTxHash);
// Contract status: PENDING (0)

// Step 3: Sign payout authorization
// Wait for vault provider to prepare claim/payout transactions
const payoutManager = new PayoutManager({ network: "signet", btcWallet });

// For each claimer, sign BOTH PayoutOptimistic and Payout transactions
// const { signature: payoutOptimisticSig } = await payoutManager.signPayoutOptimisticTransaction({
//   payoutOptimisticTxHex: claimerTx.payout_optimistic_tx.tx_hex,
//   peginTxHex: result.fundedTxHex,
//   claimTxHex: claimerTx.claim_tx.tx_hex,
//   depositorBtcPubkey: "...",
//   vaultProviderBtcPubkey: "...",
//   vaultKeeperBtcPubkeys: [...],
//   universalChallengerBtcPubkeys: [...],
// });

// Submit signatures to vault provider
// Wait for vault provider to acknowledge (contract status: PENDING → VERIFIED)
console.log("Payout signatures submitted");

// Step 4: Sign and broadcast to Bitcoin
// Wait for contract status to become VERIFIED (1) before broadcasting
const btcTxid = await peginManager.signAndBroadcast({
  fundedTxHex: result.fundedTxHex,
  depositorBtcPubkey: "...",
});

console.log("Broadcasted:", btcTxid);
// Contract status will become ACTIVE (2) after Bitcoin confirmations
```

### What Each Step Returns

| Step | Method/Manager           | Returns                                                                           |
| ---- | ------------------------ | --------------------------------------------------------------------------------- |
| 1    | `preparePegin()`         | `{ btcTxHash, fundedTxHex, vaultScriptPubKey, selectedUTXOs, fee, changeAmount }` |
| 2    | `registerPeginOnChain()` | `{ ethTxHash, vaultId }`                                                          |
| 3    | `PayoutManager` methods  | `{ signature }` (for each payout transaction)                                     |
| 4    | `signAndBroadcast()`     | `btcTxid` (string)                                                                |

---

## PayoutManager

Signs payout authorizations for vault providers.

### What It Does

**Used during peg-in Step 3** - After registering a vault (Step 2), the vault provider prepares claim/payout transactions. You must sign these to pre-authorize future fund distribution before broadcasting to Bitcoin (Step 4).

**Important:** This is NOT the same as redemption/withdrawal. During peg-in, you pre-sign transactions that enable the vault provider to distribute your funds in the future when you request redemption.

### Configuration

```typescript
import { PayoutManager } from "@babylonlabs-io/ts-sdk/tbv/core";

const payoutManager = new PayoutManager({
  network: "signet",
  btcWallet, // Your BitcoinWallet implementation
});
```

### Methods

```typescript
// Sign PayoutOptimistic (normal path - no challenge)
const { signature } = await payoutManager.signPayoutOptimisticTransaction({
  payoutOptimisticTxHex: "...",    // From vault provider
  peginTxHex: "...",               // Your peg-in transaction
  claimTxHex: "...",               // Claim transaction
  depositorBtcPubkey: "...",
  vaultProviderBtcPubkey: "...",
  vaultKeeperBtcPubkeys: [...],
  universalChallengerBtcPubkeys: [...],
});

// Sign Payout (challenge path - after Assert)
const { signature } = await payoutManager.signPayoutTransaction({
  payoutTxHex: "...",
  peginTxHex: "...",
  assertTxHex: "...",              // Assert transaction (challenge path)
  depositorBtcPubkey: "...",
  vaultProviderBtcPubkey: "...",
  vaultKeeperBtcPubkeys: [...],
  universalChallengerBtcPubkeys: [...],
});
```

---

## Wallet Interfaces

Managers require wallet implementations. You provide these based on your app.

### BitcoinWallet

```typescript
interface BitcoinWallet {
  getPublicKeyHex(): Promise<string>; // x-only pubkey (64 hex chars)
  getAddress(): Promise<string>; // Bitcoin address
  getNetwork(): Promise<string>; // Bitcoin network (mainnet, testnet, signet)
  signPsbt(psbtHex: string, options?: SignPsbtOptions): Promise<string>;
  signMessage(message: string, type: "bip322-simple" | "ecdsa"): Promise<string>;
}
```

### EthereumWallet

Uses viem's `WalletClient` directly.

```typescript
import { createWalletClient, http } from "viem";
import { sepolia } from "viem/chains";

const ethWallet = createWalletClient({
  chain: sepolia,
  transport: http(),
  account: "0x...",
});
```

---

## Next Steps

- **[Primitives](./primitives.md)** - Low-level functions for custom implementations
- **[AAVE Integration](../integrations/aave/README.md)** - Use vaults as collateral
- **[API Reference](../api/managers.md)** - Complete function signatures
