# `deriveVaultSecrets` Specification

**Spec revision**: 0.1 (draft)
**Date**: 2026-04-22
**Authors**: Jerome Wang (Babylon Labs)
**Status**: Draft

---

## Abstract

`deriveVaultSecrets` is an SDK-level helper for the Babylon Trustless
Bitcoin Vaults (TBV) protocol. It turns a single wallet
[`deriveContextHash`][derive-context-hash-spec] call into the three
domain-separated secrets a Babylon BTC vault needs: the HTLC
**hashlock preimage**, the depositor **auth anchor**, and the
**WOTS seed**. It runs one HKDF-Expand (RFC 5869) per secret over
the 32-byte wallet-derived root, using distinct prefix-free `info`
labels so the outputs are computationally independent under the
assumption that HMAC-SHA-256 is a PRF.

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
gate on key material. `hashlockSecret` is the partial case — once a
BTC vault reaches `VERIFIED`, leaking the preimage lets anyone broadcast
the pre-authorized PegIn tx (no theft; depositor still mints vBTC).
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
| **Pre-PegIn transaction** | The Bitcoin transaction the depositor signs to fund one or more BTC vaults. Contains one HTLC output per BTC vault plus a single shared `OP_RETURN` output carrying the auth-anchor commitment. |
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
   on Ethereum via `activateVaultWithSecret` to move the BTC vault
   from `VERIFIED` → `ACTIVE`.
2. A single 32-byte **auth anchor** per Pre-PegIn transaction:
   committed as `SHA256(anchor)` in the single `OP_RETURN` output of
   the Pre-PegIn (shared across every BTC vault funded by the
   transaction); revealed off-chain to the vault provider's
   `auth_createDepositorToken` RPC to obtain a short-lived CWT bearer
   token for depositor-facing RPCs.
3. One 64-byte **WOTS seed** per BTC vault: expanded by
   `deriveWotsBlockPublicKeys` into the one-time signature keypairs
   used for that BTC vault's BaBe / claim-graph commitments and
   Assert-path signing; only the `keccak256` hash of the derived
   public keys appears on-chain as `depositorWotsPkHash`.

A naive use of [`deriveContextHash`][derive-context-hash-spec] would
prompt the wallet for each secret, for every BTC vault. This spec
prompts **once per Pre-PegIn** for the `rootDerivation`, then derives
the three secrets locally via HKDF-Expand with prefix-free `info`
labels. The outputs are computationally independent under the PRF
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
  the HTLC hashlock, later revealed via `activateVaultWithSecret`.
- **`authAnchor`** — 32 bytes, shared across the Pre-PegIn.
  `SHA256(authAnchor)` is committed in the Pre-PegIn `OP_RETURN`,
  revealed via `auth_createDepositorToken`.
- **`wotsSeed[htlcVout]`** — 64 bytes, keyed per BTC vault
  (`htlcVout` in `info`). Fed unchanged to
  `deriveWotsBlockPublicKeys`.

The derivation invokes the wallet's `deriveContextHash` **at most
once per `(appName, vaultContext)` pair** for any combination of the
three secrets across any number of `htlcVout` values. Callers
computing all three secrets for all BTC vaults together, or only a
subset across separate calls, MUST arrive at the same bytes per
named secret for the same inputs. See
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
// as the PRK. rootDerivation is the 32-byte output of an earlier
// HKDF-SHA-256 invocation (by the wallet), so this precondition is met.
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
   forbids spending the same UTXO twice in one transaction). The
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
funding UTXOs produce an identical `vaultContext` and therefore an
identical `rootDerivation` regardless of tx-level input ordering.
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
expand step." `deriveContextHash` returns a 32-byte output of
HKDF-SHA-256 — exactly a `HashLen`-byte pseudorandom key of the
shape HKDF-Expand expects as its key input. The derivation in this
spec therefore uses Expand only.

Reusing one `PRK` across multiple `Expand` calls with distinct `info`
strings is the intended HKDF pattern ([RFC 5869 §3.2], [Krawczyk
2010][krawczyk]): two outputs `T1 = Expand(PRK, info1, L)` and
`T2 = Expand(PRK, info2, L)` with `info1 ≠ info2` are computationally
independent under the assumption that HMAC-SHA-256 is a PRF.
Learning `T1` tells an attacker nothing about `T2` beyond what was
already derivable from public information.

Implementations MUST use a well-audited HKDF library.
[`@noble/hashes`][noble-hashes] (Cure53-audited, already a
transitive dependency of `@babylonlabs-io/ts-sdk`) is the reference
choice for TypeScript callers and exposes an Expand-only primitive
at `@noble/hashes/hkdf`'s `expand(...)` (its companion `extract(...)`
is not invoked by this spec). Web Crypto's
`deriveBits({ name: "HKDF" })` and Node's `crypto.hkdf` always run
the Extract step and are therefore **not** byte-for-byte equivalent
to this spec. Implementations built on those APIs produce different
outputs than the spec prescribes and MUST NOT be presented as
conforming.

### 2.5 SDK Implementation Guidance

This spec pins the algorithm, not the API surface. SDKs MAY expose
the derivation operation however is most ergonomic, subject to two
requirements:

1. The number of `wallet.deriveContextHash` calls for a given
   `(appName, vaultContext)` MUST NOT exceed one, regardless of how
   many of the three secrets the caller requests, across how many
   `htlcVout` values, or how those requests are split across separate
   SDK calls.
2. The bytes returned for each named secret MUST be identical to
   those produced by the algorithm in
   [§2.2](#22-derivation-algorithm) for the same inputs.

The recommended shape for TypeScript SDKs is a **root + pure
expanders** pattern. The per-BTC-vault expanders take an `htlcVout`
parameter; the shared `authAnchor` expander does not:

```
// Wallet-touching: triggers one deriveContextHash call per call.
// vaultContext is per Pre-PegIn (see §2.3).
deriveVaultRoot(wallet, vaultContext)
    → Promise<Uint8Array[32]>

// Pure, synchronous, no wallet, no state — OK to call multiple times.
expandAuthAnchor(root)                    → Uint8Array[32]  // shared
expandHashlockSecret(root, htlcVout: u32) → Uint8Array[32]  // per BTC vault
expandWotsSeed(root, htlcVout: u32)       → Uint8Array[64]  // per BTC vault
```

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
  function is async, exactly one function invokes the wallet.
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

A secret in scope MAY still be sufficient to complete a *fixed,
pre-authorized* Bitcoin spend when combined with public on-chain
data; such cases MUST be called out per-label below.

The three current labels are evaluated against each rule. Each
cell names the specific protocol component that prevents the rule
from being violated.

| Label | Rule 1 | Rule 2 | Rule 3 |
|-------|--------|--------|--------|
| `hashlockSecret` | **Partial — pre-authorized spend, no theft.** Pegin sigs use `SIGHASH_ALL`/`SIGHASH_DEFAULT` (fixed outputs); `activateVaultWithSecret` re-checks `msg.sender == depositor`. Once `VERIFIED`, all participant sigs are public in `peginInputSignatures`, so a leaked preimage can broadcast the pegin tx and destroy the depositor's refund leaf — but the depositor still holds the same preimage and can mint vBTC, so no theft. | No. Only on-chain consumer is the depositor-bound `activateVaultWithSecret`. | No. |
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
the ETH activation gate is depositor-only but the BTC-side pegin
spend is not (see §3). A future label that relied on the on-chain
commitment as sole proof of knowledge would violate §3's scope and
require a
challenge-response signature instead.

### 3.2 Transparency gap

Wallet UX transparency only extends as far as the value the wallet
returns to the dApp. `deriveContextHash` exposes the root; the three
secrets are HKDF-Expand outputs computed in the dApp's JavaScript
context and are not visible to the wallet or surfaced back to the
user at signing time. A user who wants to independently verify what
ended up on-chain (an OP_RETURN hashlock, a WOTS commitment) must
reconstruct the derivation by running the spec's algorithm against
the wallet's returned root — not by reading the transaction data in
their wallet.

---

## 4. Test Vectors

Conformance vectors share the wallet test setup with
[`derive-context-hash.md` §4][derive-context-hash-spec]:

- BIP-39 mnemonic (no passphrase):
  ```
  abandon abandon abandon abandon abandon abandon
  abandon abandon abandon abandon abandon about
  ```
- BIP-32 private key at `m/73681862'` (hex):
  ```
  391cdb922097ec9c96fc13cadb01d5745ccf31f5dbec3a38103440714779ec85
  ```
- `appName` for Vectors 1–3: `"test-app"` (chosen to share the
  sister spec's `appName` so each `rootDerivation` equals a
  sister-spec vector and can be pinned by cross-reference). Vector 4
  uses the production `appName` `"babylon-btc-vault"` to exercise the
  fixed-app-name constant used at runtime.

### Label info encodings

Both the `auth-anchor` (empty ctx) and per-BTC-vault (4-byte
big-endian `htlcVout` in ctx) forms are shown:

```
// Shared across the Pre-PegIn (no per-BTC-vault ctx bytes):
info("auth-anchor", []) :=
    62 61 62 79 6c 6f 6e 62 74 63 76 61 75 6c 74   // "babylonbtcvault"
    0b                                             // label length = 11
    61 75 74 68 2d 61 6e 63 68 6f 72               // "auth-anchor"
    00 00                                          // ctx length = 0

// Per BTC vault, for htlcVout = 0:
info("hashlock", I2OSP(0, 4)) :=
    62 61 62 79 6c 6f 6e 62 74 63 76 61 75 6c 74   // "babylonbtcvault"
    08                                             // label length = 8
    68 61 73 68 6c 6f 63 6b                        // "hashlock"
    00 04                                          // ctx length = 4
    00 00 00 00                                    // I2OSP(0, 4)

info("wots-seed", I2OSP(0, 4)) :=
    62 61 62 79 6c 6f 6e 62 74 63 76 61 75 6c 74   // "babylonbtcvault"
    09                                             // label length = 9
    77 6f 74 73 2d 73 65 65 64                     // "wots-seed"
    00 04                                          // ctx length = 4
    00 00 00 00                                    // I2OSP(0, 4)

// Per BTC vault, for htlcVout = 2 (e.g. third vault in the Pre-PegIn):
info("hashlock", I2OSP(2, 4)) :=
    62 61 62 79 6c 6f 6e 62 74 63 76 61 75 6c 74   // "babylonbtcvault"
    08                                             // label length = 8
    68 61 73 68 6c 6f 63 6b                        // "hashlock"
    00 04                                          // ctx length = 4
    00 00 00 02                                    // I2OSP(2, 4)
```

### Vector 1 — sister spec Vector 1 context, single-HTLC (vout = 0)

```
vaultContext (hex): deadbeef

rootDerivation (from sister spec §4 Vector 1, verbatim):
  3b0e2d90a01122eed8a520648073892f6b2d8f4419216023d63cdbd49500fca3

authAnchor        := HKDF-Expand-SHA-256(
                         root, info("auth-anchor", []),        32)
hashlockSecret[0] := HKDF-Expand-SHA-256(
                         root, info("hashlock",  I2OSP(0, 4)), 32)
wotsSeed[0]       := HKDF-Expand-SHA-256(
                         root, info("wots-seed", I2OSP(0, 4)), 64)
```

### Vector 2 — sister spec Vector 2 context, batch (vouts 0, 1, 2)

```
vaultContext (hex): 00

rootDerivation (from sister spec §4 Vector 2, verbatim):
  50775126782c1a5e4d60daa4666b2c7590f0b5a445a4115b0abd411467c92597

authAnchor        := HKDF-Expand-SHA-256(
                         root, info("auth-anchor", []), 32)

// Per-BTC-vault values for i ∈ {0, 1, 2}:
for i in [0, 1, 2]:
  hashlockSecret[i] := HKDF-Expand-SHA-256(
                           root, info("hashlock",  I2OSP(i, 4)), 32)
  wotsSeed[i]       := HKDF-Expand-SHA-256(
                           root, info("wots-seed", I2OSP(i, 4)), 64)
```

This vector is the critical batch test: the three
`hashlockSecret[i]` values and three `wotsSeed[i]` values MUST be
pairwise distinct, and `authAnchor` MUST match the single value
produced by `HKDF-Expand(root, info("auth-anchor", []), 32)`
regardless of which HTLC index is being processed.

### Vector 3 — canonical Babylon BTC vault context shape

`appName = "test-app"`.

```
depositorBtcPubkey (32 bytes, x-only):
  0101010101010101010101010101010101010101010101010101010101010101

Two funding UTXOs. Each 36-byte outpoint is serialized as
`txid (32 bytes, display order) || vout (u32 big-endian)`. The
36-byte serializations are sorted ascending lexicographically before
hashing (per §2.3). For this vector the tx input order happens to
match the sorted order, but the canonical form depends only on the
outpoint set:

  outpoint_a (smaller under byte-order):
    txid: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
          aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    vout: 00000000
  outpoint_b (larger under byte-order):
    txid: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
          bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
    vout: 00000001

fundingOutpointsCommitment := SHA-256(
    outpoint_a (36 bytes) || outpoint_b (36 bytes)
)    // 32 bytes

vaultContext :=
    I2OSP(32, 4) || depositorBtcPubkey
 || I2OSP(32, 4) || fundingOutpointsCommitment
```

Per-BTC-vault values are computed with
`info("hashlock", I2OSP(htlcVout, 4))` and
`info("wots-seed", I2OSP(htlcVout, 4))` for each `htlcVout` in the
Pre-PegIn (not a positional BTC-vault index — the actual output
index of that BTC vault's HTLC within the Pre-PegIn transaction).

### Vector 4 — production `appName`

Same `vaultContext` bytes as Vector 3 but with
`appName = "babylon-btc-vault"`. This vector exercises the fixed
app-name constant used in production and ensures implementations do
not hard-code `"test-app"` by accident.

### Promotion criteria

Draft → RFC promotion requires this section to pin, for each vector,
the concrete 32-byte `hashlockSecret` / `authAnchor` and the concrete
64-byte `wotsSeed` hex outputs.

Each output MUST be cross-validated against **two independent
HKDF-Expand-capable implementations**. Because this spec is
Expand-only (no Extract), implementations that expose only full HKDF
(`Extract+Expand` in one call) are **not** usable for direct
conformance testing — their outputs differ. Approved implementations:

- `@noble/hashes/hkdf` via `expand(...)` (TypeScript)
- Rust `hkdf` crate via `Hkdf::from_prk(...).expand(...)`
- A manual `HMAC-SHA-256` loop per RFC 5869 §2.3

`rootDerivation` values for Vectors 1–2 are pinned by cross-reference
to the sister spec and do not need to be recomputed. Vectors 3–4
must have their `rootDerivation` values pinned as part of the
promotion work.

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

Any additional labels MUST NOT be equal to, nor a prefix of, any
existing label. Label length MUST be in `[1, 255]` and context
length MUST be in `[0, 65535]`.
