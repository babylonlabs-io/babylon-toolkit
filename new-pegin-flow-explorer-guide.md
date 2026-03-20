# New PegIn Flow — Explorer Integration Guide

> **Audience:** Xangle explorer team
> **Date:** 2026-03-19

---

## 1. What Changed (TL;DR)

The vault activation mechanism has been redesigned. Previously, a Vault Provider submitted a **BTC Merkle inclusion proof** on Ethereum to activate a vault. Now, the depositor reveals a **cryptographic secret** to activate it. This introduces a new **Pre-PegIn** transaction on Bitcoin and replaces proof verification with a simpler hash-based activation.

**Old flow:**

```
PegIn Request → ACK collection → Verified → Submit BTC inclusion proof → Active
```

**New flow:**

```
PegIn Request → Collect input signatures → ACK collection → Verified → Reveal secret → Active
```

Key benefits: faster activation (~1h vs ~5h), lower gas costs (no on-chain light client), simpler architecture.

---

## 2. Vault Status

### 2.1 On-chain Solidity Enum

The contract enum shape is unchanged — 5 values, same indices:

```solidity
enum BTCVaultStatus {
    Pending,    // 0 - Request submitted, collecting input signatures + ACKs
    Verified,   // 1 - All ACKs collected, waiting for secret reveal
    Active,     // 2 - Secret revealed, vault is live (was: "proof verified")
    Redeemed,   // 3 - Vault redeemed (unchanged)
    Expired     // 4 - Timed out (unchanged)
}
```

### 2.2 Indexer API Statuses

The indexer exposes a richer set of statuses. **If the explorer reads from the indexer API (recommended), use these:**

| Indexer status | On-chain equivalent | Description |
|----------------|---------------------|-------------|
| `pending` | Pending (0) | Request submitted, collecting input signatures |
| `signatures_collected` | Pending (0) | All PegIn input signatures batch-posted, ACK collection in progress |
| `verified` | Verified (1) | All ACKs collected, waiting for depositor to reveal secret |
| `available` | Active (2) | Secret revealed, vault is live and earning yield |
| `redeemed` | Redeemed (3) | Redemption initiated on Ethereum, BTC claimable by depositor |
| `depositor_withdrawn` | — | Depositor has claimed BTC on Bitcoin. **Requires hosting [babylon-btc-monitor](https://github.com/babylonlabs-io/babylon-btc-monitor)** — this service watches Bitcoin for the UTXO spend and updates the status. Without it, vaults remain in `redeemed`. |
| `liquidated` | — | Vault was liquidated |
| `expired` | Expired (4) | Timed out (AckTimeout or ActivationTimeout) |
| `invalid` | — | Flagged as invalid by external services |

> **Important terminology:** The contract calls it `Active`, the indexer stores it as `available`. They mean the same thing. Similarly, `signatures_collected` is an indexer-only status — on-chain, the vault is still `Pending(0)` until all ACKs arrive and it transitions to `Verified(1)`.

### 2.3 Explorer Label Updates

| Status | Old label | New label |
|--------|-----------|-----------|
| `verified` | Awaiting inclusion proof | Awaiting activation |
| `available` / Active | Proof verified | Vault activated |
| `signatures_collected` | *(new)* | Signatures collected, awaiting ACKs |
| `depositor_withdrawn` | *(new)* | BTC withdrawn |

---

## 3. New & Modified Events

### 3.1 `PegInSubmitted` (modified — was `PegInPending`)

Emitted when a depositor submits a pegin request.

| Field | Type | Indexed | Notes |
|-------|------|---------|-------|
| `pegInTxHash` | `bytes32` | Yes | Vault ID |
| `depositor` | `address` | Yes | |
| `vaultProvider` | `address` | Yes | |
| `amount` | `uint256` | No | BTC amount in sats |
| `hashlock` | `bytes32` | No | **NEW** — SHA256 hash commitment for activation |
| `unsignedPrePeginTx` | `bytes` | No | **NEW** — Pre-PegIn HTLC transaction (for data availability) |
| `depositorPayoutBtcAddress` | `bytes` | No | |
| `depositorLamportPkHash` | `bytes32` | No | |
| `referralCode` | `uint32` | No | |
| `paramsVersion` | `uint16` | No | |

### 3.2 `PeginInputSignaturePosted` (NEW)

Emitted when a single participant submits their PegIn input signature.

| Field | Type | Indexed | Notes |
|-------|------|---------|-------|
| `vaultId` | `bytes32` | Yes | |
| `btcPubKey` | `bytes32` | Yes | BTC public key of signer |
| `signature` | `bytes` | No | Schnorr signature |

### 3.3 `PeginInputSignaturesBatchPosted` (NEW)

Emitted when the Vault Provider batch-submits all required PegIn input signatures. This is the "all signatures collected" milestone. The indexer transitions the vault from `pending` → `signatures_collected` on this event.

| Field | Type | Indexed | Notes |
|-------|------|---------|-------|
| `vaultId` | `bytes32` | Yes | |
| `vaultProvider` | `address` | Yes | |

### 3.4 `PeginACKSubmitted` (existing, unchanged)

Emitted when challengers acknowledge the pegin request.

| Field | Type | Indexed | Notes |
|-------|------|---------|-------|
| `pegInTxHash` | `bytes32` | Yes | |
| `ackers` | `address` | Yes | |

### 3.5 `PeginRequestVerified` (existing, unchanged)

Emitted when all required ACKs are collected. Vault moves to `Verified`.

### 3.6 `PeginActivated` (NEW)

Emitted when the depositor reveals the secret and the vault transitions to `Active` (indexer: `available`).

| Field | Type | Indexed | Notes |
|-------|------|---------|-------|
| `vaultId` | `bytes32` | Yes | a.k.a. `pegInTxHash` |
| `depositor` | `address` | Yes | |
| `secret` | `bytes` | No | 32-byte preimage (`SHA256(secret) == hashlock`) |

### 3.7 `PeginExpired` (modified)

The expiry reason enum changed:

| Old reason | New reason |
|------------|------------|
| `ProofTimeout` | `ActivationTimeout` |
| `AckTimeout` | `AckTimeout` (unchanged) |

Expiration can occur from `pending`, `signatures_collected`, or `verified` status.

---

## 4. New Contract Functions

### 4.1 `activateVaultWithSecret(bytes32 vaultId, bytes calldata s)`

Called by the depositor to activate the vault by revealing the secret.

- Validates: `SHA256(s) == vault.hashlock`, `s.length == 32`, within activation deadline
- Transitions: `Verified → Active`
- Emits: `PeginActivated`

### 4.2 `submitPeginInputSignatureBatch(bytes32 vaultId, bytes32[] btcPubKeys, bytes[] signatures)`

Called by the Vault Provider to submit all PegIn input signatures in one transaction.

- Validates completeness: must include VP + all VKs + all UCs
- Emits: `PeginInputSignaturesBatchPosted`

### 4.3 `submitPeginInputSignature(bytes32 vaultId, bytes32 btcPubKey, bytes signature)`

Submit a single participant's signature. Emits `PeginInputSignaturePosted`.

### 4.4 `getPeginInputSignatures(bytes32 vaultId) → (bytes32[] btcPubKeys, bytes[] signatures)`

**Read function** — returns all collected PegIn input signatures for a vault. Useful for showing signature collection progress.

### 4.5 `hashlockToVaultId(bytes32 hashlock) → bytes32`

**Read function** — reverse lookup from hashlock to vault ID. Hashlocks are globally unique.

---

## 5. Updated Vault Data Structure

The `BTCVault` struct changes:

| Field | Type | Change | Notes |
|-------|------|--------|-------|
| `hashlock` | `bytes32` | **NEW** | SHA256 hash commitment used for vault activation |
| `depositorSignedPeginTx` | `bytes` | **RENAMED** | Was `unsignedPegInTx`, now stores depositor-signed pegin tx |

Removed: the old `unsignedPegInTx` field (replaced by `depositorSignedPeginTx`).

The `unsignedPrePeginTx` is available in the `PegInSubmitted` event (not stored in the struct).

---

## 6. New Protocol Parameters

These are part of the on-chain versioned parameters and affect explorer display/logic:

| Parameter | Type | Chain | Purpose |
|-----------|------|-------|---------|
| `peginActivationTimeout` | `uint256` | Ethereum (blocks) | Deadline for secret reveal after vault creation |
| `tRefund` | `uint32` | Bitcoin (blocks) | Refund timelock on Pre-PegIn HTLC tx |
| `tStale` | `uint32` | Bitcoin (blocks) | Staleness threshold for Pre-PegIn tx |
| `minPeginFeeRate` | `uint64` | Bitcoin (sat/vB) | Minimum fee rate for pegin transactions |

---

## 7. Removed Functionality

| Removed | Replacement |
|---------|-------------|
| `submitInclusionProofBatch()` | `activateVaultWithSecret()` |
| BTC Merkle proof events/logic | Secret-based activation |
| `ProofTimeout` expiry reason | `ActivationTimeout` expiry reason |

---

## 8. Explorer Lifecycle — Step by Step

The diagram below uses **indexer statuses** (what the API returns).

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Depositor calls submitPeginRequest(... hashlock, prePeginTx) │
│    → Status: pending                                             │
│    → Event: PegInSubmitted (includes hashlock + unsignedPrePeginTx)│
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│ 2. VP batch-submits pegin input signatures                       │
│    → Status: signatures_collected                                │
│    → Events: PeginInputSignaturePosted (per signer)              │
│              PeginInputSignaturesBatchPosted (when complete)      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│ 3. Challengers (VKs + UCs) submit ACKs                           │
│    → Status: still signatures_collected                          │
│    → Event: PeginACKSubmitted (per acker)                        │
│                                                                   │
│    When all ACKs collected:                                       │
│    → Status: verified                                            │
│    → Event: PeginRequestVerified                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
┌─────────────▼────────────┐  ┌────────▼──────────────────────────┐
│ 4a. Depositor reveals     │  │ 4b. Timeout expires                │
│     secret                │  │     → Status: expired              │
│     → Status: available   │  │     → Event: PeginExpired          │
│     → Event: PeginActivated│  │       (reason: ActivationTimeout   │
│                            │  │        or AckTimeout)              │
└─────────────┬────────────┘  └──────────────────────────────────┘
              │
┌─────────────▼────────────┐
│ 5. Vault redeemed          │
│    → Status: redeemed      │
│    (BTC claimable by       │
│     depositor)             │
└─────────────┬────────────┘
              │
┌─────────────▼──────────────────┐
│ 6. Depositor claims BTC         │
│    → Status: depositor_withdrawn│
│    (requires babylon-btc-monitor│
│     service watching Bitcoin    │
│     for the UTXO spend)        │
└─────────────────────────────────┘
```

**Timeout rules:**
- `AckTimeout` can expire vaults in `pending` or `signatures_collected` status
- `ActivationTimeout` can expire vaults in `verified` status

---

## 9. Key Explorer Display Recommendations

1. **Show hashlock** on vault detail pages — it uniquely identifies the pegin commitment
2. **Show activation deadline** — compute from `createdAt + peginActivationTimeout` (in ETH blocks)
3. **Show signature collection progress** — use `getPeginInputSignatures(vaultId)` to show how many of the required signers have submitted
4. **Show secret** on activated vaults — available from the `PeginActivated` event
5. **Distinguish expiry reasons** — `AckTimeout` (challengers didn't respond) vs `ActivationTimeout` (depositor didn't reveal secret in time)
6. **Pre-PegIn tx** — the `unsignedPrePeginTx` from `PegInSubmitted` can be decoded to show the BTC HTLC transaction (contains the hashlock spend path + refund timelock path)
7. **Map indexer status to display labels** — use the indexer status directly for a 1:1 mapping (no conditional logic needed):

| Indexer status | Suggested display |
|----------------|-------------------|
| `pending` | Collecting signatures |
| `signatures_collected` | Collecting ACKs |
| `verified` | Ready to activate |
| `available` | Active |
| `redeemed` | Redemption in progress |
| `depositor_withdrawn` | BTC withdrawn *(requires btc-monitor)* |
| `expired` | Expired |
| `liquidated` | Liquidated |
| `invalid` | Invalid |

---

## 10. Event Indexing Checklist

| Event | When to Index | Key Fields | Indexer status after |
|-------|---------------|------------|----------------------|
| `PegInSubmitted` | Vault creation | vaultId, depositor, vaultProvider, amount, hashlock | `pending` |
| `PeginInputSignaturePosted` | Signature progress | vaultId, btcPubKey | *(no status change)* |
| `PeginInputSignaturesBatchPosted` | All sigs collected | vaultId, vaultProvider | `signatures_collected` |
| `PeginACKSubmitted` | ACK progress | pegInTxHash, ackers | *(no status change)* |
| `PeginRequestVerified` | All ACKs collected | pegInTxHash, depositor | `verified` |
| `PeginActivated` | Secret revealed | vaultId, depositor, secret | `available` |
| `PeginExpired` | Timeout | pegInTxHash, reason | `expired` |
