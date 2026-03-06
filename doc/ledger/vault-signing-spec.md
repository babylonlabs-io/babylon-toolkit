# BTC Vault — Ledger Signing Integration Spec

Technical specification for Ledger app builders describing every BTC signing operation in the vault deposit flow: what transactions are constructed, what scripts are used, what the Ledger device needs to verify, and how to avoid blind signing.

---

## 1. Signing Operations Overview

A vault deposit requires the depositor to sign multiple BTC operations. The table below lists every signing operation in order:

| # | Operation | Signing Type | Key Path | Sighash | Count |
|---|-----------|-------------|----------|---------|-------|
| 1 | Split TX (multi-vault SPLIT only) | PSBT — Taproot key-path | BIP-86 tweaked key | SIGHASH_DEFAULT | 0 or 1 |
| 2 | Proof of Possession (PoP) | BIP-322 simple message | BIP-86 tweaked key | N/A | 1 (reused across vaults) |
| 3 | Claimer Payout (VP + VK payouts) | PSBT — Taproot script-path | Untweaked raw key | SIGHASH_DEFAULT | C per vault (C = num claimers) |
| 4 | Depositor Payout | PSBT — Taproot script-path | Untweaked raw key | SIGHASH_DEFAULT | 1 per vault |
| 5 | NoPayout (per challenger) | PSBT — Taproot script-path | Untweaked raw key | SIGHASH_DEFAULT | N per vault |
| 6 | PegIn TX broadcast | PSBT — Taproot key-path | BIP-86 tweaked key | SIGHASH_DEFAULT | 1 per vault |

Where:
- C = number of claimers (VP + vault keepers), so C = M + 1 where M = number of VKs
- N = number of challengers (vault keepers + universal challengers, excluding VP)
- All Schnorr signatures are 64 bytes (no sighash flag byte appended for SIGHASH_DEFAULT)
- **Total signatures per vault = (M+1) + 1 + N = 2M + N + 2** (with M VKs and N challengers)

**Wallet prompts (best case, batch-capable wallet, single vault):** 4 BTC + 1 ETH = 5 total
**Wallet prompts (worst case, sequential, single vault):** 1 (PoP) + C (payouts) + 1+N (depositor graph) + 1 (broadcast) BTC prompts + 1 ETH

**Example signature counts:**

| Config | M (VKs) | N (challengers) | Total sigs |
|--------|---------|-----------------|------------|
| Devnet | 2 | 0 | 6 |
| Mainnet (planned) | 4 | 4 | 14 |

---

## 2. Global Constants

| Constant | Value | Usage |
|----------|-------|-------|
| NUMS Internal Key | `50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0` | BIP-341 unspendable key. Used as `tapInternalKey` for ALL vault outputs. Disables key-path spending. |
| Leaf Version | `0xC0` | Tapscript v0 (BIP-342) |
| depositorClaimValue | 500,000 sats | Value of the depositor claim output (TODO: will come from on-chain params) |
| Transaction Version | 2 | Required for OP_CHECKSEQUENCEVERIFY |
| Locktime | 0 | All vault transactions |

---

## 3. Operation Details

### 3.1 Split Transaction (Multi-Vault SPLIT Strategy Only)

**Purpose:** Splits the depositor's UTXOs into multiple outputs — one per vault — when the depositor doesn't have enough separate UTXOs to fund each vault independently.

**Transaction structure:**
- **Inputs:** Depositor's wallet UTXOs (P2TR, BIP-86)
- **Outputs:** One P2TR output per vault (to depositor's own address), sized for vault amount + fees + depositorClaimValue. Plus change output if needed.

**PSBT fields per input:**
```
witnessUtxo: { script: <P2TR scriptPubKey>, value: <sats> }
tapInternalKey: <depositor x-only pubkey, 32 bytes>
```

**Signing:** Standard **Taproot key-path spend** (BIP-86). The wallet applies the taproot tweak to the depositor's key. No `disableTweakSigner`. No `tapLeafScript`.

**Ledger verification:** This is a standard BTC self-transfer. The Ledger should verify:
- All outputs go to the depositor's own addresses
- Input amounts ≥ output amounts (valid fee)

---

### 3.2 Proof of Possession (PoP)

**Purpose:** Proves the depositor controls the BTC private key. Submitted to the Ethereum BTCVaultsManager contract.

**Message format:**
```
<depositor_eth_address>:<chainId>:pegin:<btcVaultsManager_contract_address>
```
Example: `0xabcd...1234:11155111:pegin:0x5678...ef01`

- Addresses are lowercase with `0x` prefix
- Signed using BIP-322 "simple" message signing

**Signing method:** `wallet.signMessage(message, "bip322-simple")`

**BIP-322 internals:**
1. Message hash: `SHA256(SHA256("BIP0322-signed-message") || SHA256("BIP0322-signed-message") || message_bytes)`
2. A virtual "to_spend" transaction is constructed with the message hash
3. A "to_sign" transaction spending it is created as a PSBT
4. The wallet signs this PSBT internally
5. The witness data is extracted and returned as base64

**Ledger verification:** The Ledger should display the message to the user so they can verify the ETH address and contract. The existing BTC staking Ledger app already supports BIP-322 via `signMessage()`.

**PoP reuse:** In multi-vault deposits, the PoP is signed once. The `btcPopSignature` returned from the first vault registration is reused as `preSignedBtcPopSignature` for subsequent vaults.

---

### 3.3 PegIn Output — The Vault UTXO Taproot Tree

Before describing payout signing, it's essential to understand the vault output that all payout transactions spend.

**Output 0 of the PegIn transaction** is a P2TR output with:

- **Internal key:** NUMS point (unspendable) — key-path spending is impossible
- **Script tree:** Single leaf at depth 0 containing the **payout script**

**Payout script (the single tap leaf):**
```
<Depositor>       OP_CHECKSIGVERIFY
<VaultProvider>   OP_CHECKSIGVERIFY
<VK_1> OP_CHECKSIG <VK_2> OP_CHECKSIGADD ... <N_vk> OP_NUMEQUALVERIFY
<UC_1> OP_CHECKSIG <UC_2> OP_CHECKSIGADD ... <N_uc> OP_NUMEQUALVERIFY
<timelockPegin> OP_CHECKSEQUENCEVERIFY
```

Where:
- All public keys are x-only (32 bytes)
- Vault keepers are sorted lexicographically, N-of-N via OP_CHECKSIGADD
- Universal challengers are sorted lexicographically, M-of-M via OP_CHECKSIGADD
- `timelockPegin` = CSV timelock in blocks

**Control block (33 bytes for single-leaf tree):**
```
[0xC0 | parity_bit] || [NUMS_internal_key_32_bytes]
```
No merkle path hashes because there's only one leaf.

**Connector params needed to derive this script:**
```typescript
interface PayoutConnectorParams {
  depositor: string;             // x-only pubkey (64 hex chars)
  vaultProvider: string;         // x-only pubkey
  vaultKeepers: string[];        // x-only pubkeys (will be sorted)
  universalChallengers: string[];// x-only pubkeys (will be sorted)
  timelockPegin: number;         // CSV timelock in blocks
}
```

**Output 1 of the PegIn transaction** is the depositor claim output:
- P2TR with NUMS internal key, single leaf: `<Depositor> OP_CHECKSIG`
- Value: `depositorClaimValue` (500,000 sats)

---

### 3.4 Claimer Payout Signing (VP/VK Payouts)

**Purpose:** The depositor pre-signs one payout transaction per claimer (VP, each VK). These signatures are submitted to the vault provider and used later if that claimer needs to claim the vault.

**Payout transaction structure:**
- **Input 0:** PegIn:0 (the vault UTXO) — `sequence = timelockPegin` (CSV enforced)
- **Input 1:** Assert:0 — depositor does NOT sign this input
- **Outputs:** Payout to receiver, optional VP commission, CPFP anchor

**PSBT construction for Input 0 (depositor signs):**
```
hash: <pegin txid>
index: 0
sequence: <timelockPegin>
witnessUtxo: {
  script: <vault output P2TR scriptPubKey>,
  value: <vault amount in sats>
}
tapLeafScript: [{
  leafVersion: 0xC0,
  script: <payout script bytes>,         // from WASM getPeginPayoutScript()
  controlBlock: <control block bytes>     // 33 bytes for single-leaf tree
}]
tapInternalKey: <NUMS point, 32 bytes>
// sighashType: omitted (defaults to SIGHASH_DEFAULT = 0x00)
```

**PSBT construction for Input 1 (depositor does NOT sign):**
```
hash: <assert txid>
index: 0
sequence: <timelockAssert>
witnessUtxo: {
  script: <assert output 0 scriptPubKey>,
  value: <assert output 0 value>
}
// No tapLeafScript — not signed by depositor
// witnessUtxo is required because SIGHASH_DEFAULT commits to ALL inputs' prevouts
```

**Sign options:**
```typescript
{
  autoFinalized: false,
  signInputs: [{
    index: 0,
    publicKey: <depositor compressed pubkey, 33 bytes / 66 hex>,
    disableTweakSigner: true   // CRITICAL: script-path spend uses untweaked key
  }]
}
```

**Ledger requirements:**
- Sign with the depositor's **raw (untweaked)** private key
- Compute the tap leaf hash from `(leafVersion=0xC0, payoutScript)`
- Use `SIGHASH_DEFAULT (0x00)` which commits to all prevouts
- Produce a 64-byte Schnorr signature (no appended sighash byte)
- Place signature in `tapScriptSig` keyed by depositor's x-only pubkey + tap leaf hash

**Ledger verification:** The device should reconstruct the payout script from the provided parameters (depositor, VP, VKs, UCs, timelock) and verify it matches the `tapLeafScript` in the PSBT. This is how blind signing is avoided — the device knows the script template.

---

### 3.5 Depositor Payout Signing (Depositor-as-Claimer)

**Purpose:** The depositor is also a claimer. This is identical to claimer payout signing (Section 3.4) but the depositor is both the signer and the claimer.

**Difference from claimer payout:**
- Prevouts are provided directly by the VP (not parsed from transaction hex)
- Uses the same payout script from the same PeginPayoutConnector
- Same PSBT structure, same sign options

---

### 3.6 NoPayout Signing (Per Challenger)

**Purpose:** Pre-signs a NoPayout transaction for each challenger. If a challenger proves the depositor's assertion was invalid, the NoPayout path is executed.

**What it spends:** Assert output 0 (the same output referenced by Payout input 1, but via a different taproot leaf).

**Assert output 0 taproot tree (multi-leaf):**
1. **Payout leaf:** Claimer + AllChallengers + Timelock (the "happy path")
2. **NoPayout leaves (one per challenger):** Claimer + SpecificChallenger
3. **CouncilNoPayout leaf:** Security council override

**PSBT construction for Input 0 (depositor signs):**
```
hash: <prevout txid>
index: <prevout index>
sequence: <from VP-provided unsigned tx>
witnessUtxo: {
  script: <Assert output 0 P2TR scriptPubKey>,
  value: <Assert output 0 value>
}
tapLeafScript: [{
  leafVersion: 0xC0,
  script: <NoPayout script for this challenger>,   // from WASM
  controlBlock: <control block with merkle path>    // from WASM (>33 bytes due to multi-leaf tree)
}]
tapInternalKey: <NUMS point, 32 bytes>
```

Additional inputs (if any) include only `witnessUtxo` — depositor signs input 0 only.

**Connector params for NoPayout script derivation:**
```typescript
interface AssertPayoutNoPayoutConnectorParams {
  claimer: string;                // depositor x-only pubkey
  localChallengers: string[];     // local challenger x-only pubkeys
  universalChallengers: string[]; // universal challenger x-only pubkeys (sorted)
  timelockAssert: number;         // CSV timelock for assert period
  councilMembers: string[];       // security council x-only pubkeys
  councilQuorum: number;          // council quorum (N-of-N)
}
```

Each challenger gets a unique NoPayout script via `getNoPayoutScript(challengerPubkey)`.

**Sign options:** Same as payout — `{ autoFinalized: false, signInputs: [{ index: 0, publicKey, disableTweakSigner: true }] }`

**Control block:** Returned from WASM `getNoPayoutControlBlock(challengerPubkey)`. Includes merkle path hashes because Assert output 0 has multiple leaves. Size = 33 + 32*depth bytes.

**Ledger verification:** The device should reconstruct the NoPayout script from connector params + challenger pubkey and verify it matches the PSBT's `tapLeafScript`. The control block's merkle path should also be verifiable against the Assert output 0's known taproot tree structure.

---

### 3.7 PegIn Transaction Broadcast

**Purpose:** The final BTC transaction that locks the depositor's BTC into the vault.

**Transaction structure:**
- **Inputs:** Depositor's wallet UTXOs (or split TX outputs for SPLIT strategy)
- **Outputs:** Vault output (P2TR with payout script tree), depositor claim output, change output

**PSBT fields per input:**
```
witnessUtxo: { script: <P2TR scriptPubKey>, value: <sats> }
tapInternalKey: <depositor x-only pubkey, 32 bytes>
// This is the DEPOSITOR's key, not the NUMS point — these are the depositor's own wallet UTXOs
```

**Signing:** Standard **Taproot key-path spend** (BIP-86). The wallet applies the taproot tweak. No `disableTweakSigner`. No `tapLeafScript`.

**Ledger verification:** Standard BTC spend. The device should verify:
- Output 0 matches the expected vault P2TR address (derivable from the payout connector params)
- Output 1 matches the depositor claim address
- Fee is reasonable

---

## 4. Summary: What the Ledger App Needs to Support

### Signing Methods Required

| Method | Used For | Key Handling |
|--------|----------|-------------|
| BIP-322 simple message signing | PoP | Standard (tweaked BIP-86 key) |
| PSBT Taproot key-path (BIP-86) | Split TX, PegIn broadcast | Standard (tweaked key) |
| PSBT Taproot script-path (BIP-342) | All payout/nopayout | **Untweaked raw key** (`disableTweakSigner: true`) |

### Script Templates to Recognize

| Template | Parameters | Where Used |
|----------|-----------|------------|
| **Payout script** | depositor, VP, VKs[], UCs[], timelockPegin | Payout PSBTs (claimer + depositor) |
| **NoPayout script** | claimer, challengers, UCs[], timelockAssert, council[], quorum + specific challenger | NoPayout PSBTs |

### PSBT Fields the Device Must Process

| Field | Key Type | Present In |
|-------|---------|------------|
| `PSBT_IN_WITNESS_UTXO` (0x01) | — | All inputs (required for SIGHASH_DEFAULT) |
| `PSBT_IN_TAP_LEAF_SCRIPT` (0x15) | — | Script-path inputs (payout, nopayout) |
| `PSBT_IN_TAP_INTERNAL_KEY` (0x17) | — | All taproot inputs |

### Existing BTC Staking Ledger Pattern

The BTC staking Ledger integration uses a **wallet policy** system:
1. The frontend passes `contracts` (staking parameters) and `action` (transaction type name) in `SignPsbtOptions`
2. The Ledger provider constructs a `WalletPolicy` from these parameters
3. The Ledger device reconstructs the expected script from the policy and verifies it matches the PSBT
4. The device displays a human-readable action name (e.g., "Staking transaction", "Unbonding")

**For vault integration, the same pattern should be followed:**
- Define new action names (e.g., `SIGN_BTC_VAULT_PAYOUT`, `SIGN_BTC_VAULT_NOPAYOUT`, `SIGN_BTC_VAULT_PEGIN`)
- Define new contract types carrying the vault parameters (depositor, VP, VKs, UCs, timelocks, challenger)
- Implement policy functions that reconstruct vault scripts from these parameters
- The Ledger app firmware recognizes vault script templates alongside existing staking templates

### Key Differences from BTC Staking

| Aspect | BTC Staking | BTC Vault |
|--------|-------------|-----------|
| Participants | staker, finality provider, covenant committee | depositor, VP, VKs[], UCs[], council[] |
| Script complexity | Multisig + timelock | Multisig + timelock |
| PSBTs per operation | 1-2 | 1 + N per vault (N = challengers) |
| Script-path signing | Yes (taproot script-path) | Yes (same pattern) |
| Key-path signing | Yes (withdraw) | Yes (PegIn broadcast, Split TX) |
| BIP-322 message | Not used | PoP message signing |
| Multiple inputs per PSBT | No (1 input) | No (1 input per PSBT) |

---

## 5. Complete Signing Sequence Diagram

### Single-Vault Deposit

```
User clicks "Deposit"
  │
  ├─ 1. PoP: signMessage(bip322-simple)              ← BTC wallet prompt
  │     Message: "<eth>:<chainId>:pegin:<contract>"
  │
  ├─ 2. ETH Registration: sendTransaction()           ← ETH wallet prompt
  │     submitPeginRequest to BTCVaultsManager
  │
  ├─ 3. [Wait for VP to prepare transactions...]
  │
  ├─ 4. Claimer Payouts: signPsbts([...C PSBTs])      ← BTC wallet prompt (batch)
  │     Each PSBT: input 0 = PegIn:0, script-path
  │     disableTweakSigner: true
  │
  ├─ 5. Depositor Graph: signPsbts([...1+N PSBTs])    ← BTC wallet prompt (batch)
  │     [Payout, NoPayout_0, NoPayout_1, ...]
  │     All script-path, disableTweakSigner: true
  │
  ├─ 6. Submit signatures to VP via RPC
  │
  └─ 7. PegIn Broadcast: signPsbt(peginPSBT)          ← BTC wallet prompt
        Standard key-path spend of depositor's UTXOs
```

### Multi-Vault Deposit (SPLIT Strategy, 2 Vaults)

```
User clicks "Deposit" with partial liquidation enabled
  │
  ├─ 0. Split TX: signPsbt(splitPSBT)                 ← BTC wallet prompt
  │     Key-path spend, outputs to self
  │     Broadcast immediately, wait for mempool
  │
  ├─ 1. PoP: signMessage(bip322-simple)                ← BTC wallet prompt (once)
  │
  ├─ [Per vault (vault 0, then vault 1):]
  │   ├─ 2. ETH Registration                           ← ETH wallet prompt
  │   ├─ 3. [Wait for VP...]
  │   ├─ 4. Claimer Payouts: signPsbts([...])           ← BTC wallet prompt
  │   ├─ 5. Depositor Graph: signPsbts([...])           ← BTC wallet prompt
  │   ├─ 6. Submit signatures
  │   └─ 7. PegIn Broadcast: signPsbt(...)              ← BTC wallet prompt
  │         (uses split TX output as input)
  │
  └─ PoP signature from vault 0 is reused for vault 1
```
