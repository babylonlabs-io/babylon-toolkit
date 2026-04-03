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

> **Managers** are high-level classes that orchestrate multi-step BTC vault operations with wallet integration. See [Managers Quickstart](./managers.md) for details.

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

## Primitives

The full [transaction graph](https://github.com/babylonlabs-io/btc-vault/blob/main/docs/pegin.md#2-transaction-graph-and-presigning) includes additional transaction types (Claim, Assert, ChallengeAssert, NoPayout, WronglyChallenged). When the vault provider acts as claimer, most of these are generated and managed by the vault provider. The SDK provides primitives for operations the **depositor** performs: building the peg-in transaction and signing payout authorizations. When the depositor acts as claimer (depositor-as-claimer path), the SDK also provides builders for the NoPayout and ChallengeAssert PSBTs.

### 1. buildPeginPsbt

Builds an **unfunded** [peg-in](https://github.com/babylonlabs-io/btc-vault/blob/main/docs/pegin.md) transaction hex (0 inputs, 1 BTC vault output).

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

### 2. buildPayoutPsbt

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

### 3. extractPayoutSignature

Extracts 64-byte Schnorr signature from a signed PSBT.

```typescript
import { extractPayoutSignature } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";

const signature = extractPayoutSignature(signedPsbtHex, depositorBtcPubkey);

// Returns: "abc123..." (128 hex chars = 64 bytes)
```

**Use this to:** Get the signature after signing, then submit to vault provider.

---

## Depositor-as-Claimer Path

When the depositor acts as the claimer (instead of the vault provider), the depositor must sign 3 types of PSBTs per vault:

1. **Payout** (1 per vault) — depositor signs using PeginPayoutConnector (same connector as VP/VK payout)
2. **NoPayout** (1 per challenger) — covers the case where the vault expires without a successful claim
3. **ChallengeAssert** (1 per challenger, with 3 inputs) — covers the challenge-assert spending paths

The vault provider supplies the unsigned transaction hexes and prevouts. You build PSBTs, sign them, extract the Schnorr signatures, and return them.

```typescript
import {
  buildDepositorPayoutPsbt,
  buildNoPayoutPsbt,
  buildChallengeAssertPsbt,
  extractPayoutSignature,
} from "@babylonlabs-io/ts-sdk/tbv/core/primitives";

const depositorPubkey = "abc123..."; // x-only, 64 hex chars

// 1. Payout (depositor-as-claimer variant)
// Uses PeginPayoutConnector — input 0 spends PegIn vault UTXO
const payoutPsbtHex = await buildDepositorPayoutPsbt({
  payoutTxHex: "...",               // From vault provider
  prevouts: payoutPrevouts,         // [{script_pubkey, value}] from VP
  connectorParams: {                // PeginPayoutConnector params
    depositor: depositorPubkey,
    vaultProvider: "...",
    vaultKeepers: ["..."],
    universalChallengers: ["..."],
    timelockPegin: 50,
  },
});
const signedPayout = await wallet.signPsbt(payoutPsbtHex);
const payoutSig = extractPayoutSignature(signedPayout, depositorPubkey);

// 2. NoPayout (one per challenger)
// Uses AssertPayoutNoPayoutConnector — input 0 spends Assert output 0
const noPayoutPsbtHex = await buildNoPayoutPsbt({
  noPayoutTxHex: "...",             // From vault provider
  challengerPubkey: "def456...",    // This challenger's x-only pubkey
  prevouts: noPayoutPrevouts,       // [{script_pubkey, value}] from VP
  connectorParams: {                // AssertPayoutNoPayoutConnector params
    claimer: depositorPubkey,
    localChallengers: [],
    universalChallengers: ["..."],
    timelockAssert: 144,
    councilMembers: ["..."],
    councilQuorum: 3,
  },
});
const signedNoPayout = await wallet.signPsbt(noPayoutPsbtHex);
const noPayoutSig = extractPayoutSignature(signedNoPayout, depositorPubkey);

// 3. ChallengeAssert (one PSBT per challenger, with 3 inputs)
// Each input has its own taproot script from per-segment connector params
const caPsbtHex = await buildChallengeAssertPsbt({
  challengeAssertTxHex: "...",      // From vault provider
  prevouts: challengeAssertPrevouts, // [{script_pubkey, value}] from VP (flat, 3 entries)
  connectorParamsPerInput: [         // One per input (3 total)
    { claimer: depositorPubkey, challenger: "def456...", lamportHashesJson: "...", gcInputLabelHashesJson: "..." },
    { claimer: depositorPubkey, challenger: "def456...", lamportHashesJson: "...", gcInputLabelHashesJson: "..." },
    { claimer: depositorPubkey, challenger: "def456...", lamportHashesJson: "...", gcInputLabelHashesJson: "..." },
  ],
});
const signedCA = await wallet.signPsbt(caPsbtHex);
// Extract 3 signatures (one per input)
const caSig0 = extractPayoutSignature(signedCA, depositorPubkey, 0);
const caSig1 = extractPayoutSignature(signedCA, depositorPubkey, 1);
const caSig2 = extractPayoutSignature(signedCA, depositorPubkey, 2);
```

All three builders return a PSBT hex string and all use `extractPayoutSignature()` for signature extraction (same Schnorr extraction mechanism). The `extractPayoutSignature` function accepts an optional `inputIndex` parameter (defaults to 0) for extracting signatures from specific inputs.

---

## Utilities

The SDK provides utility functions you'll need when using primitives.

### Transaction Utilities

```typescript
import {
  selectUtxosForPegin, // UTXO selection with fee calculation
  peginOutputCount, // Compute output count for fee estimation
  calculateBtcTxHash, // Get tx hash from hex
  fundPeginTransaction, // Add inputs/change to unfunded tx hex
  P2TR_INPUT_SIZE, // Fee calculation constants
  BTC_DUST_SAT,
} from "@babylonlabs-io/ts-sdk/tbv/core";
```

#### UTXO Selection

```typescript
const { selectedUTXOs, fee, changeAmount } = selectUtxosForPegin(
  availableUTXOs, // Your UTXOs
  amount, // Target amount (satoshis)
  feeRate, // sat/vB
  peginOutputCount(vaultCount), // N HTLCs + CPFP anchor
);
```

#### Calculate Transaction Hash

```typescript
const txHash = calculateBtcTxHash(txHex); // Returns "0x..." format
```

### Data Conversion Helpers

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
- **[Aave Integration](../integrations/aave/README.md)** - Use BTC vaults as collateral
- **[API Reference](../api/primitives.md)** - Complete function signatures
