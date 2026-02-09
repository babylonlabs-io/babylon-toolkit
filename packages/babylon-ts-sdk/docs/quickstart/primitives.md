# Primitives

Pure functions for Bitcoin PSBT building. No wallet access, no network calls, just data transformation.

> For complete function signatures, see [API Reference](../api/primitives.md).

## What Are Primitives?

Primitives are the lowest-level SDK functions. They:

- Build Bitcoin PSBTs (Partially Signed Bitcoin Transactions)
- Are pure functions: given inputs → return outputs, no external calls
- Have zero dependencies on wallets or network
- Work in Node.js, browsers, serverless, anywhere

## When to Use Primitives

| Use Case                                       | Use            |
| ---------------------------------------------- | -------------- |
| Backend services with custom signing (KMS/HSM) | **Primitives** |
| Need full control over every step              | **Primitives** |
| Custom wallet integrations                     | **Primitives** |
| Browser app with standard wallet               | Managers       |
| Quick integration, less code                   | Managers       |

**Using primitives means YOU implement:**

- Bitcoin wallet signing
- Ethereum contract calls
- Vault provider RPC communication
- Bitcoin transaction broadcasting

---

## The 4 Primitives

### 1. buildPeginPsbt

Builds an **unfunded** peg-in transaction hex (0 inputs, 1 vault output).

```typescript
import { buildPeginPsbt } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";

const result = await buildPeginPsbt({
  depositorPubkey: "abc123...", // x-only, 64 hex chars, no 0x
  vaultProviderPubkey: "def456...",
  vaultKeeperPubkeys: ["ghi789..."],
  universalChallengerPubkeys: ["jkl012..."],
  pegInAmount: 100000n, // satoshis
  network: "signet",
});

// Returns:
// {
//   psbtHex: "...",           // Unfunded transaction hex (you add inputs via PSBT)
//   vaultScriptPubKey: "...", // Vault output script
//   vaultValue: 100000n,      // Vault amount
//   txid: "...",              // Transaction ID (will change after funding)
// }
```

**Note:** Despite the field name `psbtHex`, this contains raw unfunded transaction hex (not PSBT format). You must construct a PSBT from it, add UTXOs as inputs, add change output, sign, and broadcast.

**You then:** Add UTXOs as inputs, add change output, sign, broadcast.

### 2. buildPayoutOptimisticPsbt

Builds unsigned PayoutOptimistic PSBT for depositor signing (normal path - no challenge).

```typescript
import { buildPayoutOptimisticPsbt } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";

const result = await buildPayoutOptimisticPsbt({
  payoutOptimisticTxHex: "...",  // From vault provider
  peginTxHex: "...",             // Your peg-in transaction
  claimTxHex: "...",             // Claim transaction from VP
  depositorBtcPubkey: "...",
  vaultProviderBtcPubkey: "...",
  vaultKeeperBtcPubkeys: [...],
  universalChallengerBtcPubkeys: [...],
  network: "signet",
});

// Returns:
// {
//   psbtHex: "...",  // Sign input 0 with your BTC key
// }
```

**You then:** Sign input 0, extract signature, submit to vault provider.

### 3. buildPayoutPsbt

Builds unsigned Payout PSBT for depositor signing (challenge path - after Assert).

```typescript
import { buildPayoutPsbt } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";

const result = await buildPayoutPsbt({
  payoutTxHex: "...",            // From vault provider
  peginTxHex: "...",             // Your peg-in transaction
  assertTxHex: "...",            // Assert transaction from VP
  depositorBtcPubkey: "...",
  vaultProviderBtcPubkey: "...",
  vaultKeeperBtcPubkeys: [...],
  universalChallengerBtcPubkeys: [...],
  network: "signet",
});

// Returns:
// {
//   psbtHex: "...",  // Sign input 0 with your BTC key
// }
```

### 4. extractPayoutSignature

Extracts 64-byte Schnorr signature from a signed PSBT.

```typescript
import { extractPayoutSignature } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";

const signature = extractPayoutSignature(signedPsbtHex, depositorBtcPubkey);

// Returns: "abc123..." (128 hex chars = 64 bytes)
```

**Use this to:** Get the signature after signing, then submit to vault provider.

---

## Utilities (Also Available)

The SDK also provides utility functions you'll need when using primitives:

```typescript
import {
  selectUtxosForPegin, // UTXO selection with fee calculation
  calculateBtcTxHash, // Get tx hash from hex
  fundPeginTransaction, // Add inputs/change to unfunded tx hex
  P2TR_INPUT_SIZE, // Fee calculation constants
  BTC_DUST_SAT,
} from "@babylonlabs-io/ts-sdk/tbv/core";
```

### UTXO Selection

```typescript
const { selectedUTXOs, fee, changeAmount } = selectUtxosForPegin(
  availableUTXOs, // Your UTXOs
  amount, // Target amount (satoshis)
  feeRate, // sat/vB
);
```

### Calculate Transaction Hash

```typescript
const txHash = calculateBtcTxHash(txHex); // Returns "0x..." format
```

---

## Bitcoin Utilities

Helper functions for pubkey/hex handling:

```typescript
import {
  toXOnly, // Convert 33-byte to 32-byte pubkey
  stripHexPrefix, // Remove "0x" prefix
  hexToUint8Array, // Convert hex string to bytes
  uint8ArrayToHex, // Convert bytes to hex string
  validateWalletPubkey, // Validate pubkey format
} from "@babylonlabs-io/ts-sdk/tbv/core/primitives";
```

---

## Comparison: Primitives vs Managers

| Aspect                  | Primitives               | Managers                        |
| ----------------------- | ------------------------ | ------------------------------- |
| **PSBT Building**       | You use primitives       | Uses primitives internally      |
| **Wallet Integration**  | You implement            | Built-in (accepts interface)    |
| **UTXO Selection**      | You call utility         | Built-in                        |
| **Fee Calculation**     | You call utility         | Built-in                        |
| **PoP Generation**      | You implement            | Built-in                        |
| **Ethereum Submission** | You implement            | Built-in                        |
| **Broadcasting**        | You implement            | Built-in                        |
| **Use Case**            | Custom backends, KMS/HSM | Browser apps, quick integration |

---

## Next Steps

- **[Managers](./managers.md)** - High-level orchestration (easier)
- **[AAVE Integration](../integrations/aave/README.md)** - Use vaults as collateral
- **[API Reference](../api/primitives.md)** - Complete function signatures
