# Primitives

Low-level PSBT builders. No wallet access, no network calls, just data transformation.

> For complete function signatures, see [API Reference](../api/primitives.md).

## What Are Primitives?

Primitives are the lowest-level SDK functions. They:

- Build Bitcoin PSBTs (Partially Signed Bitcoin Transactions)
- Are deterministic: given inputs → return outputs, no network access
- Need no wallet and no RPC endpoint
- The PSBT builders are `async` because they lazily initialise the WASM engine on first use; the signature extractors are synchronous
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

The full [transaction graph](https://github.com/babylonlabs-io/btc-vault/blob/main/docs/pegin.md#2-transaction-graph-and-presigning) includes additional transaction types (Claim, Assert, ChallengeAssert, NoPayout, WronglyChallenged). When the vault provider acts as claimer, most of these are generated and managed by the vault provider. The SDK provides primitives for operations the **depositor** performs: building the peg-in transaction and signing payout authorizations. When the depositor acts as claimer (depositor-as-claimer path), the SDK also provides the NoPayout builder; the ChallengeAssert builder exists for tooling only, since the claimer never signs it.

### 1. buildPrePeginPsbt + buildPeginTxFromFundedPrePegin

Peg-in is a **two-step flow** on Bitcoin:

1. `buildPrePeginPsbt()` — build an unfunded **Pre-PegIn** tx with one HTLC output per vault (plus an optional auth-anchor `OP_RETURN` and a CPFP anchor). No inputs yet — the caller funds it.
2. `buildPeginTxFromFundedPrePegin()` — once the Pre-PegIn is funded and its txid is known, derive the **PegIn** tx that spends the HTLC output back to the vault connector.

See the [protocol spec](https://github.com/babylonlabs-io/btc-vault/blob/main/docs/pegin.md) for why this is split.

```typescript
import {
  buildPrePeginPsbt,
  buildPeginTxFromFundedPrePegin,
} from "@babylonlabs-io/ts-sdk/tbv/core/primitives";

// Step 1: unfunded Pre-PegIn tx
const prePegin = await buildPrePeginPsbt({
  vaultCoreVersion: 3,                  // on-chain activeVaultCoreVersion; drives HTLC sizing
  depositorPubkey: "abc123...",         // x-only, 64 hex chars, no 0x
  vaultProviderPubkey: "def456...",
  vaultKeeperPubkeys: ["ghi789..."],
  universalChallengerPubkeys: ["jkl012..."],
  hashlocks: ["aabb...cc"],             // one per vault (64-char hex, no 0x prefix)
  timelockRefund: 144,                  // CSV blocks for refund path
  pegInAmounts: [100_000n],             // one per vault (satoshis)
  feeRate: 10n,                         // sat/vB, from offchain params
  minPeginFeeRate: 2n,                  // sat/vB floor baked into the HTLC value
  numLocalChallengers: 1,               // depositor-as-claimer: the vault keepers
  councilQuorum: 3,
  councilSize: 5,
  network: "signet",
});
// prePegin.psbtHex is the UNFUNDED tx hex (no inputs yet).
// Caller funds it (selectUtxosForPegin + fundPeginTransaction), then computes
// the funded txid.

// Step 2: derive PegIn tx that spends a single HTLC output
const pegin = await buildPeginTxFromFundedPrePegin({
  prePeginParams: { /* same params as above */ },
  timelockPegin: 144,                   // CSV blocks for the PegIn vault output
  fundedPrePeginTxHex: "0100...",       // Funded Pre-PegIn tx hex (no 0x prefix)
  htlcVout: 0,                          // Index of the HTLC output to spend
});
```

**Full parameter shapes:** see the [API Reference](../api/primitives.md) — both `PrePeginParams` and the return type `PrePeginPsbtResult` expose additional batch fields (one entry per vault).

### 2. buildPayoutPsbt

Builds the unsigned Payout PSBT for depositor signing.

Payout ends two of the three peg-out paths: the happy path (`Claim → Assert → Payout`), and the claimer-wins challenge path (`… → ChallengeAssert → WronglyChallenged → Payout`). Only NoPayout, the challenger-wins branch, blocks it. Input 0 (PegIn:0) waits `timelockPegin`, input 1 (Assert:0) waits `timelockAssert`.

```typescript
import { buildPayoutPsbt } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";

const result = await buildPayoutPsbt({
  vaultCoreVersion: 3,
  payoutTxHex: "...",            // From vault provider
  peginTxHex: "...",             // Your peg-in transaction
  assertTxHex: "...",            // Assert transaction from VP
  depositorBtcPubkey: "...",
  vaultProviderBtcPubkey: "...",
  vaultKeeperBtcPubkeys: [...],
  universalChallengerBtcPubkeys: [...],
  timelockPegin: 144,
  timelockAssert: 144,
  claimerBtcPubkey: "...",       // depositor's own key on the depositor-as-claimer path
  registeredPayoutScriptPubKey: "...",
  commissionBps: 50,
  protocolFeeRate: 2n,
  councilMembers: ["..."],
  councilQuorum: 3,
  vkClaimerPayoutScriptPubKeys: { /* vaultKeeperPubkey -> scriptPubKey hex */ },
  vpCommissionScriptPubKey: "...",
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

When the depositor is the claimer, they pre-sign **1 + N PSBTs**, where N is the number of challengers:

1. **Payout** (1 per vault) — `buildPayoutPsbt` with `claimerBtcPubkey` set to the depositor's key.
2. **NoPayout** (1 per challenger) — the challenger-wins leg of a dispute. 3 inputs (Assert:0, ChallengeAssertX:0, ChallengeAssertY:0), 1 output.

> **ChallengeAssert is not signed by the claimer.** NoPayout references specific ChallengeAssert txids, so a challenger who broadcasts a different one cannot execute NoPayout (btc-vault `tx_graph/challenger.rs`).

The vault provider supplies the unsigned transaction hexes. The depositor must
also supply the parent transactions (peg-in tx for Payout, Assert tx for
ChallengeAssert) from a trusted source — those builders cross-check every signed
input's outpoint and prevout against the parent so a malicious VP cannot trick the
wallet into signing over an attacker-chosen prevout.

> **`buildNoPayoutPsbt` is the exception.** It uses the caller-supplied `prevouts` verbatim and never sees the Assert tx, so it cannot check them. Validate them yourself, or use the `signDepositorGraph` service, which pins each input to its Assert/ChallengeAssert parent and derives the prevouts from those parents.

```typescript
import {
  buildNoPayoutPsbt,
  buildChallengeAssertPsbt,
  extractPayoutSignature,
} from "@babylonlabs-io/ts-sdk/tbv/core/primitives";

const depositorPubkey = "abc123..."; // x-only, 64 hex chars

// 1. Payout (depositor-as-claimer variant): use buildPayoutPsbt (section 2
// above) with claimerBtcPubkey = depositorPubkey, then sign and extract with
// extractPayoutSignature as shown there.

// 2. NoPayout (one per challenger)
// Uses AssertPayoutNoPayoutConnector — input 0 spends Assert:0
const noPayoutPsbtHex = await buildNoPayoutPsbt({
  noPayoutTxHex: "...",             // From vault provider
  challengerPubkey: "def456...",    // This challenger's x-only pubkey
  prevouts: [                       // REQUIRED, one per input, supplied by the VP
    { script_pubkey: "...", value: 12_345 },   // Assert:0
    { script_pubkey: "...", value: 688 },      // e.g. ChallengeAssertX:0 — the VP supplies the value
    { script_pubkey: "...", value: 688 },      // e.g. ChallengeAssertY:0
  ],
  connectorParams: {                // AssertPayoutNoPayoutConnector params
    txGraphVersion: 3,              // REQUIRED — the vault-core version
    claimer: depositorPubkey,
    localChallengers: ["..."],      // the vault keepers; never empty
    universalChallengers: ["..."],
    timelockAssert: 144,
    councilMembers: ["..."],
    councilQuorum: 3,
  },
});
const signedNoPayout = await wallet.signPsbt(noPayoutPsbtHex);
const noPayoutSig = extractPayoutSignature(signedNoPayout, depositorPubkey);

// 3. ChallengeAssert — not signed by the claimer (see above); exported for tooling.
// Two per challenger (X and Y), one input each.
const caPsbtHex = await buildChallengeAssertPsbt({
  challengeAssertTxHex: "...",      // From vault provider
  assertTxHex: "...",               // Authoritative — every input must spend an Assert output
  connectorParamsPerInput: [        // One entry per input of the supplied tx
    {
      txGraphVersion: 3,            // REQUIRED
      claimer: depositorPubkey,
      challenger: "def456...",
      claimerWotsKeysJson: "...",
      gcWotsKeysJson: "...",
    },
  ],
});
```

Payout and NoPayout signatures are extracted with `extractPayoutSignature()` (same Schnorr extraction mechanism). It accepts an optional `inputIndex` parameter (defaults to 0).

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
  peginOutputCount(vaultCount, hasAuthAnchor), // N HTLCs + CPFP anchor (+ auth-anchor OP_RETURN)
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
