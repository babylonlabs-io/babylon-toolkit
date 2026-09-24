# Vault Secret Derivation Specification

**Spec revision**: 0.2 (draft)
**Date**: 2026-09-22
**Authors**: Jerome Wang (Babylon Labs)
**Status**: Draft — no output changes over revision 0.1; conformance changes listed below

> **Source of truth.** The golden tests pin the exact bytes:
> [`expand.test.ts`](../../packages/babylon-ts-sdk/src/tbv/core/vault-secrets/__tests__/expand.test.ts)
> for the root-to-secret expansion and
> [`context.golden.test.ts`](../../packages/babylon-ts-sdk/src/tbv/core/vault-secrets/__tests__/context.golden.test.ts)
> for the `vaultContext` encoding. `golden_vectors_pinned` in `btc-vault` and
> `vault_secret_golden_vectors_pinned` in vault-wasm `lib.rs` pin the same expanded outputs.
> If this document and the tests disagree, the tests win. Any change is a hard fork (CLAUDE.md,
> critical path 4).

---

## Changes from revision 0.1

No output changes: the derivation, the labels and the `info` encoding are the same. Implementers
pinning revision 0.1 should re-check the rule changes below.

**Rule changes**

- **§2.1, §2.5: the one-call rule.** Was: `deriveContextHash` is called at most once per
  `(appName, vaultContext)`. Now: one call MUST be enough for every secret in a Pre-PegIn, and
  later flows MAY call again to re-derive the same root.
- **§2.3:** the funding-outpoint set must not be empty.
- **§2.4:** a root from an MPC or other non-HD wallet MUST be a cryptographically strong 32-byte
  key.
- **§3:** the scope exception now also covers a permissionless contract transition whose BTC
  destination is fixed by recorded keys (`claimExpiredVault`).
- **Appendix A.2:** the rule against a label that is a prefix of another label is dropped; A.1's
  length byte already keeps their `info` strings distinct.

**Corrections**

- **API names match the SDK.** Revision 0.1 described a `deriveVaultSecrets` helper and
  `deriveWotsBlockPublicKeys`; neither exists. The SDK exposes `deriveVaultRoot` plus three
  expanders (§2.5). The WOTS seed feeds `deriveWotsBlocksFromSeed` for the public keys committed
  at deposit, and `wotsKeypairFromSeed` for the claim-time keypair (§1, §2.1).
- **The expanders are async.** They run the Rust implementation through a lazily loaded WASM
  module (§2.4, §2.5).
- **§3 lists every contract path that consumes the hashlock secret**, including the
  permissionless `claimExpiredVault`.
- **§3.2** notes that the Ledger Babylon Vault app re-derives two of the three commitments on
  the device, and that the OP_RETURN carries the auth-anchor commitment, not a hashlock.
- **§4 points to the golden tests** instead of listing vectors, and the "Promotion criteria"
  subsection is removed. No test in this repository pinned revision 0.1's vector outputs, and
  their roots predate `deriveContextHash` revision 2.0.

---

## Abstract

This spec defines how the SDK for the Babylon Trustless Bitcoin
Vaults (TBV) protocol turns a single wallet
[`deriveContextHash`][derive-context-hash-spec] call into the three
domain-separated secrets a Babylon BTC vault needs: the HTLC
**hashlock preimage**, the depositor **auth anchor**, and the
**WOTS seed**. It runs one HKDF-Expand (RFC 5869) per secret over
the 32-byte wallet-derived root, using distinct `info` strings
(prefix-free by construction, [Appendix A](#appendix-a-info-encoding))
so the outputs are computationally independent under the assumption
that HMAC-SHA-256 is a PRF.

The scheme exists because each Babylon BTC vault needs several
deterministic secrets whose disclosure or loss has protocol-level
impact, and calling the wallet three times would mean three
user-approval popups per BTC vault creation — multiplied across
every BTC vault funded by the Pre-PegIn. One wallet call + three local
HKDF-Expand calls replaces that without weakening independence of
the three outputs.

**Scope.** Secrets derived under this scheme MUST NOT, on their own,
authorize unilateral fund movement, cause irreversible on-chain
state-change outside the depositor's own scope, or act as the sole
gate on key material, except for the fixed-outcome cases §3 allows
and names per label. `hashlockSecret` is that partial case — once a
BTC vault reaches `VERIFIED`, leaking the preimage lets anyone broadcast
the pre-authorized PegIn tx, or claim the vault once its activation
window has expired. Neither is theft: the depositor still mints vBTC,
and an expired claim pays only the recorded keys. A broadcast does cost
the depositor the CSV refund path, so §3 treats the preimage as the
one secret whose leak has a recovery consequence.
See [§3](#3-scope) for the per-label gates.

**Generality note.** The HKDF-Expand pattern in
[§2.2](#22-derivation-algorithm) is generic — any caller of
`deriveContextHash` can use it for multiple domain-separated
sub-keys from one wallet approval. This spec stays TBV-shaped (fixed
`appName`, three labels) because TBV is the only current consumer.
Extract the generic shape later if a second protocol adopts it.

---

## Terminology

The protocol terms used throughout this spec.

| Term | Meaning |
|------|---------|
| **BTC vault** | A single TBV vault: one Bitcoin HTLC output committed to a hashlock + depositor WOTS commitment, paired with an Ethereum registration. |
| **Pre-PegIn transaction** | The Bitcoin transaction the depositor signs to fund one or more BTC vaults. Contains one HTLC output per BTC vault, a single shared `OP_RETURN` output carrying the auth-anchor commitment, a CPFP anchor output, and usually a change output. |
| **HTLC output** | The taproot output in the Pre-PegIn that locks BTC into one BTC vault. Identified by its output index (`htlcVout`) within the Pre-PegIn. |
| **`htlcVout`** | The output index (0-based) of a BTC vault's HTLC output within the Pre-PegIn. On-chain `uint8`; encoded as 4 bytes big-endian in the HKDF `info` label for prefix-free domain separation. |
| **Funding outpoints** | The `(txid, vout)` UTXOs the Pre-PegIn spends as inputs. Their canonical commitment is part of `vaultContext`. |
| **`vaultContext`** | The per-Pre-PegIn opaque byte string the SDK constructs and hex-encodes before passing to the wallet's `deriveContextHash` (the wallet API takes a hex string per the sister spec). Encoded per [§2.3](#23-vaultcontext-encoding-guidance). |
| **`rootDerivation`** (or **root**) | The 32-byte output of `wallet.deriveContextHash("babylon-btc-vault", hex(vaultContext))`. Used as the HKDF `PRK`. |
| **`PRK`** | Pseudorandom key, the keyed input to HKDF-Expand (RFC 5869 §2.3). In this spec, `PRK = rootDerivation` (Extract is skipped per RFC 5869 §3.3 — see [§2.4](#24-hkdf-expand)). |
| **`label`** | A short ASCII string identifying which of the three secrets a derivation produces. Defined values: `auth-anchor`, `hashlock`, `wots-seed` (see [Appendix A.2](#a2-defined-labels)). |
| **`info(label, ctx)`** | The byte string passed as HKDF-Expand's `info` argument. Encoded per [Appendix A.1](#a1-encoding) — prefix-free across labels and across context lengths. |
| **Vault provider (VP)** | Off-chain TBV operator the depositor exchanges the auth-anchor preimage with for a short-lived bearer token. |

---

## 1. Motivation

Each Pre-PegIn transaction in Babylon's Trustless Bitcoin Vaults
protocol funds one or more BTC vaults. For each Pre-PegIn the
depositor produces three kinds of secret material:

1. One 32-byte **hashlock preimage** per BTC vault: committed as
   `SHA256(preimage)` in that BTC vault's HTLC output; later revealed
   on Ethereum to move the BTC vault from `VERIFIED` → `ACTIVE`
   (`activateVaultWithSecret`, or `activateVaultWithSecretAndRedeem`
   to activate and redeem at once). See §3 for the other consumer,
   `claimExpiredVault`.
2. A single 32-byte **auth anchor** per Pre-PegIn transaction:
   committed as `SHA256(anchor)` in the single `OP_RETURN` output of
   the Pre-PegIn (shared across every BTC vault funded by the
   transaction); revealed off-chain to the vault provider's token
   RPCs (`auth_createDepositorToken`, `auth_createDepositorTokenGrpc`)
   to obtain a short-lived CWT bearer token for depositor-facing RPCs.
3. One 64-byte **WOTS seed** per BTC vault, for that BTC vault's
   one-time signature keys. At deposit, `deriveWotsBlocksFromSeed`
   expands it into the WOTS public keys for the BaBe / claim-graph
   commitments; only their `keccak256` hash appears on-chain as
   `depositorWotsPkHash`. At claim time, `wotsKeypairFromSeed`
   re-derives the keypair for Assert-path signing from the same seed.

A naive use of [`deriveContextHash`][derive-context-hash-spec] would
prompt the wallet for each secret, for every BTC vault. This spec
prompts **once per Pre-PegIn** for the `rootDerivation`, then derives
the three secrets locally via HKDF-Expand with distinct, prefix-free
`info` encodings. The outputs are computationally independent under the PRF
assumption for HMAC-SHA-256, so disclosure of one does not leak the
others or the root.

The per-BTC-vault parameter (`htlcVout`) is carried in the HKDF
`info` label rather than the wallet context — that's what lets one
wallet popup serve every BTC vault in the Pre-PegIn. Any secret can
be re-derived on demand from the same wallet + `vaultContext`,
eliminating the "lose it, lose the BTC vault" failure mode.

---

## 2. Specification

### 2.1 Derivation Operation

Inputs:

- `appName`: fixed to `"babylon-btc-vault"` across all Babylon BTC
  vault derivations under this scheme, matching the
  [wallet-integration guidance][wallet-guide] so wallets display a consistent label in
  the approval dialog.
- `vaultContext`: opaque bytes composed per
  [§2.3](#23-vaultcontext-encoding-guidance). Keyed per Pre-PegIn
  transaction, NOT per BTC vault — the per-BTC-vault parameter is
  carried through HKDF `info` instead (see `htlcVout` below).
- `htlcVout`: HTLC output index of a single BTC vault within the
  Pre-PegIn. On-chain it's `uint8`
  (`BTCVaultProtocolInfo.htlcVout`); encoded as 4 bytes big-endian in
  the HKDF `info` label for clean PRF input. Required for the
  per-BTC-vault values (`hashlockSecret`, `wotsSeed`); carried
  through `info` rather than the wallet context so one wallet popup
  per Pre-PegIn serves every BTC vault funded by it.

Outputs (conceptual — SDK API shapes vary, see §2.5):

- **`hashlockSecret[htlcVout]`** — 32 bytes, keyed per BTC vault
  (`htlcVout` in `info`). `SHA256(hashlockSecret)` is committed as
  the HTLC hashlock; the secret is revealed on Ethereum (§1).
- **`authAnchor`** — 32 bytes, shared across the Pre-PegIn.
  `SHA256(authAnchor)` is committed in the Pre-PegIn `OP_RETURN`;
  the anchor is revealed to the vault provider's token RPCs.
- **`wotsSeed[htlcVout]`** — 64 bytes, keyed per BTC vault
  (`htlcVout` in `info`). Fed unchanged to
  `deriveWotsBlocksFromSeed` at deposit and to `wotsKeypairFromSeed`
  at claim time.

One `deriveContextHash` call per `(appName, vaultContext)` pair MUST
be enough to produce all three secrets for every `htlcVout` in the
Pre-PegIn. Later flows (activation, resume, recovery) MAY call the
wallet again for the same pair; with the same wallet seed, the same
selected account (the `connectedPubkey` the wallet binds) and the
same network, each call returns the same root. A different account or
network yields a different root, which is what the SDK reports as
`VaultRootMismatchError`.
Callers computing all three secrets for all BTC vaults together, or
only a subset across separate calls, MUST arrive at the same bytes
per named secret for the same inputs. See
[§2.2](#22-derivation-algorithm) for the concrete algorithm and
[§2.5](#25-sdk-implementation-guidance) for how this translates into
an SDK surface.

**Commitment granularity.** The three secrets are committed at
different granularities:

- **`hashlockSecret`** — per BTC vault (= per Pre-PegIn HTLC output).
  `SHA256` in the HTLC taproot script.
- **`authAnchor`** — per Pre-PegIn transaction. `SHA256` in the
  single `OP_RETURN` output appended after all HTLC outputs; every
  BTC vault funded by the Pre-PegIn shares one commitment and one
  preimage.
- **`wotsSeed`** — per BTC vault. `keccak256` of the derived WOTS
  public keys is stored as `depositorWotsPkHash` on Ethereum.

To keep the wallet popup count at one per Pre-PegIn, `rootDerivation`
is keyed per Pre-PegIn and the per-BTC-vault `htlcVout` is carried
through the HKDF-Expand `info` label (see
[§2.2](#22-derivation-algorithm)).

### 2.2 Derivation Algorithm

The root is derived **once per Pre-PegIn transaction**. The
per-BTC-vault parameter (`htlcVout`, used by `hashlockSecret` and
`wotsSeed`) is carried through the HKDF-Expand `info` label, not
through the wallet context.

```
rootDerivation = deriveContextHash("babylon-btc-vault", hex(vaultContext))

// RFC 5869 §3.3: when IKM is already a cryptographically strong key
// of HashLen bytes, HKDF-Extract is omitted and IKM is used directly
// as the PRK. See §2.4 for why rootDerivation meets this.
PRK = rootDerivation                                    // 32 bytes

// Shared across the Pre-PegIn — no per-BTC-vault parameter:
authAnchor        = HKDF-Expand-SHA-256(
                        PRK, info("auth-anchor", []), 32)

// Per BTC vault, at HTLC output index `i` within the Pre-PegIn:
hashlockSecret[i] = HKDF-Expand-SHA-256(
                        PRK, info("hashlock",  I2OSP(i, 4)), 32)
wotsSeed[i]       = HKDF-Expand-SHA-256(
                        PRK, info("wots-seed", I2OSP(i, 4)), 64)
```

Output lengths are fixed at 32 bytes for `hashlockSecret[i]` and
`authAnchor`, and 64 bytes for `wotsSeed[i]`. All three lengths are
within the RFC 5869 Expand cap of `255 * HashLen = 8160` bytes for
SHA-256.

The three labels (`hashlock`, `auth-anchor`, `wots-seed`) and the
byte-level encoding of `info(label, ctx)` — including the
domain-tag, length-prefix format, and prefix-free / injectivity
argument — are specified in [Appendix A](#appendix-a-info-encoding).

### 2.3 vaultContext Encoding Guidance

`vaultContext` is opaque to the wallet and to this spec; its encoding
is the caller's responsibility. The SDK SHOULD construct it using
the length-prefixed canonical form recommended by
[`derive-context-hash.md` §2.3][derive-context-hash-spec]:

```
vaultContext := I2OSP(len(f1), 4) || f1
             || I2OSP(len(f2), 4) || f2
             || …
```

The canonical fields for `vaultContext`, in order, are:

1. The depositor's x-only BTC public key (32 bytes)
2. The **funding-outpoints commitment** (32 bytes) — a SHA-256 digest
   over the canonically-ordered serialization of the funding
   outpoints of the Pre-PegIn transaction, computed as follows:

   ```
   Each funding outpoint serialized as:
     outpoint := txid (32 bytes, display/RPC order — i.e. the form
                       shown in block explorers, NOT internal little-endian)
              || vout (4 bytes, u32 big-endian)
     // 36 bytes total

   Sort the N serialized outpoints in ascending lexicographic byte
   order over their 36-byte form, then:

   fundingOutpointsCommitment := SHA-256(
         outpoint_0 || outpoint_1 || ... || outpoint_{N-1}
   )    // 32 bytes
   ```

   Duplicate outpoints are not permitted (Bitcoin consensus already
   forbids spending the same UTXO twice in one transaction), and the
   set must not be empty. The
   canonical sort is independent of the transaction's input order,
   so any permutation of inputs that preserves the outpoint set
   yields the same commitment.

The commitment form keeps `vaultContext` at a fixed 72-byte length
regardless of how many UTXOs fund the Pre-PegIn, which both bounds
the wallet approval payload and simplifies conformance testing. The
raw outpoints remain recoverable from the broadcast Pre-PegIn
transaction's inputs, so any party re-deriving the secrets from
(wallet + broadcast tx) can reconstruct `fundingOutpointsCommitment`
byte-for-byte.

The **`htlcVout`** parameter does NOT appear in `vaultContext` — it
is carried through the HKDF-Expand `info` label for the
per-BTC-vault values (`hashlockSecret`, `wotsSeed`). Keeping the
wallet context per Pre-PegIn is what lets a single wallet popup
serve every BTC vault funded by the Pre-PegIn while still producing
independent per-BTC-vault secrets.

A commitment over funding outpoints is used rather than
`prePeginTxid` because the Pre-PegIn txid depends on the outputs
(which embed the derived commitments) — using `prePeginTxid` in the
context would be circular. Funding outpoints are known to the
depositor before construction, unique per deposit (a spent UTXO
cannot fund the same Pre-PegIn twice), and recoverable from the
broadcast Pre-PegIn transaction so the secrets can always be
re-derived given the wallet.

Because the commitment is over the canonically-sorted funding
outpoints, two Pre-PegIn transactions that spend the same set of
funding UTXOs produce an identical `vaultContext`, and therefore an
identical `rootDerivation` from the same wallet seed, selected
account and network, regardless of tx-level input ordering.
This makes same-inputs RBF and reorg rebroadcasts safe to treat as
the same derivation.

### 2.4 HKDF-Expand

HKDF (RFC 5869) separates derivation into two stages:

1. **Extract** — `PRK = HMAC-SHA-256(salt, IKM)`. Concentrates the
   entropy of an imperfect IKM into a uniformly pseudorandom key.
2. **Expand** — `T(i) = HMAC-SHA-256(PRK, T(i-1) || info || i)`.
   Derives output material keyed on the context.

Per [RFC 5869 §3.3], "in some applications, the input key material
IKM may already be present as a cryptographically strong key ... one
can skip the extract part and use IKM directly to key HMAC in the
expand step." For HD and imported-key wallets, `deriveContextHash`
returns a 32-byte output of HKDF-SHA-256 — exactly a `HashLen`-byte
pseudorandom key of the shape HKDF-Expand expects as its key input.
MPC and other non-HD wallets may use their own deterministic
derivation ([sister spec][derive-context-hash-spec] §2.2); for this
spec their output MUST also be a cryptographically strong 32-byte
key. The derivation in this spec therefore uses Expand only.

Reusing one `PRK` across multiple `Expand` calls with distinct `info`
strings is the intended HKDF pattern ([RFC 5869 §3.2], [Krawczyk
2010][krawczyk]): two outputs `T1 = Expand(PRK, info1, L)` and
`T2 = Expand(PRK, info2, L)` with `info1 ≠ info2` are computationally
independent under the assumption that HMAC-SHA-256 is a PRF.
Learning `T1` tells an attacker nothing about `T2` beyond what was
already derivable from public information.

Implementations MUST use a well-audited HKDF library. The SDK runs
the Rust `hkdf` crate (`Hkdf::from_prk(...).expand(...)`, in
`btc-vault`) through its WASM module. For TypeScript,
[`@noble/hashes`][noble-hashes] (Cure53-audited) exposes the same
Expand-only primitive as `expand(...)` in `@noble/hashes/hkdf.js`
(its companion `extract(...)` is not invoked by this spec). Web Crypto's
`deriveBits({ name: "HKDF" })` and Node's `crypto.hkdf` always run
the Extract step and are therefore **not** byte-for-byte equivalent
to this spec. Implementations built on those APIs produce different
outputs than the spec prescribes and MUST NOT be presented as
conforming.

### 2.5 SDK Implementation Guidance

This spec pins the algorithm, not the API surface. SDKs MAY expose
the derivation operation however is most ergonomic, subject to two
requirements:

1. One `wallet.deriveContextHash` call for a given
   `(appName, vaultContext)` MUST be enough to produce any of the
   three secrets for any number of `htlcVout` values. The SDK MUST
   NOT need a second wallet call to finish a Pre-PegIn.
2. The bytes returned for each named secret MUST be identical to
   those produced by the algorithm in
   [§2.2](#22-derivation-algorithm) for the same inputs.

The `@babylonlabs-io/ts-sdk` shape is a **root + expanders**
pattern. The per-BTC-vault expanders take an `htlcVout` parameter;
the shared `authAnchor` expander does not:

```
// Wallet-touching: triggers one deriveContextHash call per call.
// Builds vaultContext (see §2.3) from the depositor key and the
// Pre-PegIn funding outpoints.
deriveVaultRoot(wallet, { depositorBtcPubkey, fundingOutpoints })
    → Promise<Uint8Array[32]>

// No wallet, no state — OK to call multiple times. Async only because
// they lazily load the WASM module that runs the Rust implementation.
expandAuthAnchor(root)                    → Promise<Uint8Array[32]>  // shared
expandHashlockSecret(root, htlcVout: u32) → Promise<Uint8Array[32]>  // per BTC vault
expandWotsSeed(root, htlcVout: u32)       → Promise<Uint8Array[64]>  // per BTC vault
```

`PeginManager.preparePegin` calls `deriveVaultRoot` once per
Pre-PegIn and then expands the secrets for each vault.

The `htlcVout` parameter MUST be the BTC vault's actual HTLC output
index in the constructed Pre-PegIn transaction, encoded as
`I2OSP(htlcVout, 4)` before passing to the HKDF-Expand `info`
construction.

Rationale:

- **Per-use methods read naturally at the call site** —
  `expandAuthAnchor` during token refresh,
  `expandHashlockSecret(root, vout)` at activation of the BTC vault
  whose HTLC sits at `vout`, `expandWotsSeed(root, vout)` at claim
  time.
- **Separating "touch the wallet" from "compute a secret"** keeps the
  one-popup invariant visible in the API surface: exactly one
  function invokes the wallet.
- **`htlcVout` on the per-BTC-vault expanders** makes it a type-level
  error to reuse one expanded secret for multiple BTC vaults.

---

## 3. Scope

A secret MUST NOT be added to this scheme if any of the following
hold:

1. **Unilateral fund movement or unauthorized spend.** Knowledge of
   the secret alone redirects funds, satisfies an `msg.sender`-gated
   ETH call, or completes a Bitcoin spend whose required
   participant signatures aren't already on-chain. *(Out of scope:
   the depositor's BTC/ETH private key.)*
2. **Control-plane action with monetary, state-change, or
   third-party privacy consequence.** Knowledge of the secret alone
   releases a redemption artifact to a non-depositor, authorizes a
   BTC vault revocation, or discloses another party's private data.
   Read access to the *depositor's own* operational artifacts
   (e.g. their own presign transactions or claimer artifacts) is
   not by itself in scope of this rule. *(Out of scope: a
   decryption key for an encrypted payout PSBT.)*
3. **Sole gate on key material.** The secret is the only factor
   gating release of a private key or encrypted backup. *(Out of
   scope: an envelope key for an encrypted recovery file.)*

A secret in scope MAY still be sufficient, combined with public
on-chain data, to complete a *fixed, pre-authorized* Bitcoin spend,
or to trigger a permissionless contract transition whose BTC
destination is fixed by keys already recorded on-chain rather than
by the caller. Such cases MUST be called out per label below.

The three current labels are evaluated against each rule. Each
cell names the specific protocol component that prevents the rule
from being violated.

| Label | Rule 1 | Rule 2 | Rule 3 |
|-------|--------|--------|--------|
| `hashlockSecret` | **Partial — pre-authorized spend, no theft.** Pegin sigs use `SIGHASH_ALL`/`SIGHASH_DEFAULT` (fixed outputs); both activation paths (`activateVaultWithSecret`, `activateVaultWithSecretAndRedeem`) re-check `msg.sender == depositor`. Once `VERIFIED`, all participant sigs are public (`getPeginInputSignaturesForVault`), so a leaked preimage can broadcast the pegin tx. No theft: the destination is the vault, and the depositor still holds the same preimage. But it costs the depositor their exit options — the Pre-PegIn output is spent, so the CSV refund can no longer be broadcast, and the only remaining exits are activation (which mints vBTC) and `activateVaultWithSecretAndRedeem`. Activation is gated on the application being active and on the activation delay, so if it is blocked the redeem path is the only way out, and after the activation deadline only the permissionless `claimExpiredVault` remains. Implementers MUST protect the preimage accordingly. | **Partial — fixed-destination transition (the exception above), no theft.** `claimExpiredVault` is permissionless: for a vault expired by `ActivationTimeout`, anyone holding the preimage can move it to `Redeemed` during the grace window. The BTC destination is fixed by the recorded vault-provider and depositor keys, not by `msg.sender`, so nothing can be redirected. | No. |
| `authAnchor`     | No. Token gates depositor-scoped RPCs only; fund-moving calls require wallet sigs + on-chain `msg.sender` checks. | No. Artifacts returned (e.g. presign transactions, claimer artifacts) are the depositor's own operational data, not third-party-sensitive; mutations go through independent contract checks. | No. |
| `wotsSeed`       | No. WOTS signs one leaf of a multi-party co-signed graph; cannot unilaterally produce a valid spend. | No. The seed has no downstream RPC or contract gate; WOTS commitments are public. | No. |

### 3.1 Non-repudiation caveat

A SHA-256 commitment to a derived secret appearing on-chain (for
example a hashlock embedded in the pre-PegIn transaction) is **not
cryptographic proof that the publisher knows the preimage**. Any party
who is handed the secret can compute the same commitment and sign a
transaction carrying it; the Bitcoin signature attests to control of
the input UTXO, not to possession of the preimage.

For `authAnchor` and `wotsSeed`, this distinction is benign — each is
paired with an independent authorization gate. For `hashlockSecret`,
the two ETH activation paths are depositor-only, but
`claimExpiredVault` and the BTC-side pegin spend are not (see §3).
A future label that relied on the on-chain commitment as sole proof
of knowledge would violate §3's scope and require a
challenge-response signature instead.

### 3.2 Transparency gap

Wallet UX transparency only extends as far as the value the wallet
returns to the dApp. `deriveContextHash` exposes the root; the three
secrets are HKDF-Expand outputs computed in the dApp (the SDK's WASM
module); they are never sent to the BTC wallet or surfaced back to
the user at signing time. (The hashlock secret does pass through the
ETH wallet, as activation calldata.) A user who wants to independently verify what
ended up on-chain (the HTLC hashlocks, the auth-anchor commitment in
the OP_RETURN, the WOTS commitment) must reconstruct the derivation
by running the spec's algorithm against the wallet's returned root —
not by reading the transaction data in their wallet.

The Ledger Babylon Vault app is the exception for two of the three
secrets: it re-derives the hashlock and auth-anchor commitments on
the device from the root and binds them to the vault intent the user
approves. The WOTS commitment is still computed only in the dApp.

---

## 4. Test Vectors

The vectors live in the golden tests and are not repeated here:

- [`expand.test.ts`][expand-test], test group
  `frozen golden vectors (vendored-binary acceptance gate)`:
  `authAnchor`, `hashlockSecret` and `wotsSeed` for root `[0x42; 32]`
  and `htlcVout = 7`. `btc-vault` (`golden_vectors_pinned`) and
  vault-wasm (`vault_secret_golden_vectors_pinned` in `lib.rs`) pin
  the same values.
- [`context.golden.test.ts`][context-test]: `fundingOutpointsCommitment`
  and the 72-byte `vaultContext`, against values captured from an
  independent Rust implementation.
- The root itself comes from `deriveContextHash`; its vectors are in
  the [sister spec][derive-context-hash-spec] §4.

To check an implementation without the SDK, compare against these
with any HKDF-Expand-only implementation (Rust `hkdf` via
`Hkdf::from_prk(...).expand(...)`, `@noble/hashes` `expand(...)`, or a
manual `HMAC-SHA-256` loop per RFC 5869 §2.3). Full-HKDF APIs that
always run Extract give different outputs (§2.4).

Revision 0.1 listed Vectors 1–4 inline ([rev 0.1][rev01]). They are
still correct inputs for the algorithm, but no test in this
repository pins their outputs, and their roots predate
`deriveContextHash` revision 2.0. (The Ledger Babylon Vault app's own
unit tests pin commitments derived from Vector 1's root.)

---

## 5. References

- `deriveContextHash` spec — [`derive-context-hash.md`][derive-context-hash-spec]
- RFC 5869 — HKDF — [RFC 5869][rfc5869]
- Krawczyk 2010 — HKDF rationale — [eprint 2010/264][krawczyk]
- RFC 8017 §4.1 — I2OSP — [RFC 8017][rfc8017]
- RFC 9180 §4 — HPKE `LabeledExpand` pattern — [RFC 9180][rfc9180]
- `@noble/hashes` HKDF implementation — [noble-hashes][noble-hashes]
- Wallet BTC vault integration guide —
  [`vault-integration-guide.md`][wallet-guide]

[derive-context-hash-spec]: ./derive-context-hash.md
[rfc5869]: https://datatracker.ietf.org/doc/html/rfc5869
[krawczyk]: https://eprint.iacr.org/2010/264
[rfc8017]: https://datatracker.ietf.org/doc/html/rfc8017
[rfc9180]: https://datatracker.ietf.org/doc/html/rfc9180
[noble-hashes]: https://github.com/paulmillr/noble-hashes
[wallet-guide]: ../../packages/babylon-wallet-connector/docs/vault-integration-guide.md
[expand-test]: ../../packages/babylon-ts-sdk/src/tbv/core/vault-secrets/__tests__/expand.test.ts
[context-test]: ../../packages/babylon-ts-sdk/src/tbv/core/vault-secrets/__tests__/context.golden.test.ts
[rev01]: https://github.com/babylonlabs-io/babylon-toolkit/blob/ce167fad5dabbb1263f375f31af5594e9dbbab3d/docs/specs/derive-vault-secrets.md#4-test-vectors

---

## Appendix A. `info` Encoding

This appendix specifies the byte-level encoding of
`info(label, ctx)` used by the HKDF-Expand calls in
[§2.2](#22-derivation-algorithm), and enumerates the defined labels.

### A.1 Encoding

```
info(label, ctx) :=
       "babylonbtcvault"        // fixed 15-byte ASCII domain tag
    || I2OSP(len(label), 1)     // 1-byte label length
    || label                    // ASCII bytes of the label
    || I2OSP(len(ctx),   2)     // 2-byte big-endian ctx length
    || ctx                      // opaque per-label context bytes
                                // (may be empty)
```

`I2OSP(n, k)` is the big-endian `k`-byte encoding of `n` (RFC 8017
§4.1). Both length prefixes — the 1-byte label length and the 2-byte
context length — are fixed-width, which removes the "one info is a
prefix of another" canonicalization hazard across:

- two labels that share a prefix (e.g. `"hashlock"` vs
  `"hashlock-v2"` have different label-length bytes),
- the same label with and without context bytes (e.g.
  `info("hashlock", [])` vs `info("hashlock", I2OSP(0, 4))` differ
  in the 2-byte ctx length),
- the same label with different context values (different `ctx`
  bytes after the same fixed-width prefix).

This construction follows the pattern established by [RFC 9180
§4][rfc9180] (HPKE's `LabeledExpand`).

### A.2 Defined labels

- **`hashlock`** (ASCII `68 61 73 68 6c 6f 63 6b`) — ctx =
  `I2OSP(htlcVout, 4)`. HTLC preimage, per BTC vault.
- **`auth-anchor`** (ASCII `61 75 74 68 2d 61 6e 63 68 6f 72`) —
  ctx = *(empty)*. VP bearer-token `OP_RETURN` preimage, shared
  across Pre-PegIn.
- **`wots-seed`** (ASCII `77 6f 74 73 2d 73 65 65 64`) — ctx =
  `I2OSP(htlcVout, 4)`. WOTS block-key PRF seed, per BTC vault.

Any additional label MUST NOT be equal to an existing label. (A label
that is a prefix of another is safe: the length byte in A.1 keeps
their `info` strings distinct.) Label length MUST be in `[1, 255]`
and context length MUST be in `[0, 65535]`.
