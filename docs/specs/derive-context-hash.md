# `deriveContextHash` Specification

**Spec revision**: 1.0
**Algorithm version**: 0 (salt: `"derive-context-hash"`, no suffix)
**Date**: 2026-04-07
**Authors**: Jerome Wang (Babylon Labs)
**Status**: Draft — incorporates auditor feedback (Coinspect)

---

## Abstract

`deriveContextHash` is a wallet API method that derives a
deterministic 32-byte value from the wallet's key material, an
application name, and an application-provided context string. It
uses HKDF-SHA-256 (RFC 5869) and is designed for cross-wallet
compatibility — any conforming implementation produces the same
output for the same key material, application name, and context.

The method is generic. The wallet has no knowledge of what the
derived value is used for. dApps provide an application name and
an opaque context; the wallet displays the application name in
its approval dialog and returns a deterministic output.

---

## 1. Motivation

dApps sometimes need a deterministic secret tied to the user's
wallet — one that can be reproduced across sessions and devices
without manual storage. Examples include:

- **HTLC preimages** — commit a hash at deposit time, reveal
  the preimage days later to complete activation.
- **One-time signature seeds** — derive seed material for
  signature schemes (WOTS, Lamport) without the user managing
  a separate mnemonic.
- **Deterministic identifiers** — generate wallet-bound values
  that are stable across sessions.

Today, dApps typically generate random secrets in the browser
and ask users to save them manually. This is error-prone and
has no recovery path. `deriveContextHash` replaces this pattern:
the wallet derives the value deterministically from its own key
material, so the same context always produces the same output —
no manual step needed.

---

## 2. Specification

### 2.1 API

```
wallet.deriveContextHash(
  appName: string,
  context: string
) → Promise<string>
```

**Parameters:**
- `appName` — a human-readable application identifier (1–64
  bytes, ASCII lowercase letters, digits, and hyphens only:
  `[a-z0-9\-]`). Provides mandatory app-level domain separation:
  two dApps using different `appName` values will never produce
  the same output, even if their `context` values collide. The
  wallet MUST display `appName` in the approval dialog so the
  user can see which application is requesting the derivation.
  Wallets MUST reject `appName` values containing characters
  outside the allowed set.
  Examples: `"babylon-vault"`, `"ordinals-market"`.
- `context` — hex-encoded byte string (even-length, lowercase,
  no `0x` prefix). Application-specific data that determines the
  output within the app's namespace. Different contexts produce
  independent outputs. Must not be empty.

**Returns:**
- Hex-encoded 32-byte derived value (64 lowercase hex chars).

**Errors:**
- `appName` is empty, exceeds 64 bytes, or contains characters
  outside `[a-z0-9\-]`.
- Context is empty, odd-length, contains non-hex characters
  (including uppercase `A–F`), has a `0x` prefix, or exceeds
  1024 bytes (2048 hex characters).
- User rejects the approval dialog.
- Wallet does not support the method.

**User approval required.** The wallet MUST show a confirmation
dialog before deriving and returning the value. The dialog
MUST display the `appName` and the requesting origin. The
dialog SHOULD also display the context bytes.

### 2.2 Derivation Algorithm

```
ikm    = BIP-32 private key at path m/73681862'
salt   = "derive-context-hash"        (UTF-8 encoded)
info   = SHA-256(UTF8(appName)) || context  (raw bytes)
length = 32

output = HKDF-SHA-256(ikm, salt, info, length)
```

The `info` field is constructed by concatenating the SHA-256
hash of the UTF-8 encoded `appName` (32 bytes, fixed-length)
with the raw context bytes decoded from hex. Hashing `appName`
ensures it occupies a fixed 32-byte prefix, eliminating
length-confusion collisions between different `appName`/`context`
combinations (e.g. appName `"foobar"` + context `0x01` vs
appName `"foo"` + context `0x626172_01` can never collide).

**IKM (Input Key Material):** The raw 32-byte private key scalar
at BIP-32 derivation path `m/73681862'` (hardened), using
standard BIP-32 derivation on secp256k1. This is the 32-byte
big-endian scalar `k` only — excluding chain code, depth,
fingerprint, child number, and any serialization prefix. If
BIP-32 derivation produces an invalid child key (IL ≥ curve
order or resulting key is zero), the wallet MUST return an error
rather than skip to the next index.

The purpose index `73681862` is derived deterministically:
`trunc31_be(SHA-256("derive-context-hash"))`. This avoids
collision with registered BIP-43 purpose values (BIP-44 `44'`,
BIP-85 `83696968'`, etc.) and the reserved range
`10001'–19999'`.

The derivation path is dedicated to this method — it MUST NOT
be used for signing or any other BIP-32 derivation. Using a
BIP-32 derived key (rather than the raw BIP-39 seed) ensures
hardware wallets can run the entire derivation internally on
the secure element without exporting the private key. This
requires a dedicated device app; the stock Bitcoin app on
Ledger/Trezor does not support this operation.

The derivation path is fixed regardless of the wallet's active
account or network. All accounts derived from the same seed
share the same `deriveContextHash` root. Applications that need
per-account isolation MUST encode an account identifier in
their context.

**Imported private keys:** Wallets that support imported (non-HD)
private keys MAY offer `deriveContextHash` for those keys. Since
imported keys lack a BIP-32 hierarchy, the wallet SHOULD use the
raw 32-byte private key directly as IKM, skipping BIP-32
derivation. Outputs from imported keys are not cross-wallet
compatible — this is inherent to imported keys, which have no
shared derivation tree. Wallets MUST clearly document this
behavior to users and dApp developers.

Note: BIP-39 passphrases produce different seeds from the same
mnemonic. Two wallets with the same mnemonic but different
passphrases will produce different outputs.

**Salt:** The fixed UTF-8 string `"derive-context-hash"`.
Provides domain separation from BIP-32 and other HMAC-based
derivation schemes. For future revisions, a `-v1`, `-v2`, etc.
suffix can be appended to the salt to indicate the version of
the scheme. The current `derive-context-hash` salt is version 0
without a suffix.

**Info:** The concatenation of `SHA-256(UTF8(appName))` (32
bytes) and the raw context bytes decoded from the hex input.
The `appName` hash provides mandatory app-level domain
separation; the context is the caller-controlled parameter
that determines the output within the app's namespace. Maximum
context length is 1024 bytes (2048 hex chars). Wallets MUST
reject contexts exceeding this limit.

**Length:** 32 bytes (256 bits).

### 2.3 Context Encoding Guidance

The `context` field is opaque bytes from the wallet's
perspective, but dApps constructing multi-field contexts SHOULD
use a canonical encoding to avoid ambiguity. Recommended
approach: length-prefix each field.

```
context = len(field1) || field1 || len(field2) || field2 || ...
```

Where `len` is the byte length encoded as a 4-byte big-endian
unsigned integer. This prevents concatenation collisions (e.g.
fields `"AB" + "CD"` vs `"A" + "BCD"` producing identical
context bytes).

For fixed-length fields (txids, public keys), length prefixes
are optional but still recommended for consistency. dApps MUST
NOT rely on the wallet to parse or validate context structure —
the wallet treats context as opaque bytes.

### 2.4 HKDF-SHA-256

HKDF (RFC 5869) is a two-stage key derivation function:

1. **Extract:** `PRK = HMAC-SHA-256(salt, ikm)` — concentrates
   the entropy of the IKM into a pseudorandom key.
2. **Expand:** `output = HMAC-SHA-256(PRK, info || 0x01)` —
   derives the output keyed on the context. (For 32-byte output,
   only one HMAC block is needed.)

Implementations SHOULD use a well-audited HKDF library (e.g.
`@noble/hashes/hkdf`, OpenSSL, libsodium). Implementations
SHOULD zero intermediate key material (PRK) after use where the
runtime permits (native/firmware). In garbage-collected
environments (JavaScript), explicit zeroization is best-effort.

---

## 3. Example Use Case: Babylon Vault Deposits

This section is informational — it describes how Babylon uses
`deriveContextHash` as a concrete example.

Babylon's vault deposit flow requires depositors to commit to a
secret at deposit time and reveal that same secret days or weeks
later to activate the vault. The secret is the preimage of a
SHA-256 hash embedded in an HTLC script on Bitcoin.

The hashlock must exist before the Pre-PegIn transaction is
constructed, but the transaction hash isn't known yet — a
circular dependency. To resolve this, the dApp builds a "dummy"
Pre-PegIn transaction with a placeholder hashlock (zero),
computes its txid, and uses that as part of the context:

```
context = (dummyPrePeginTxid, htlcVout, depositorPubkey)
```

The dApp calls `deriveContextHash("babylon-vault", context)`,
computes `SHA-256(deriveContextHash("babylon-vault", context))`
to get the real hashlock, and rebuilds the Pre-PegIn with the
real hashlock. Days or weeks later at activation time, the dApp
reconstructs the same context from on-chain state — the dummy
txid is deterministic from the same inputs — calls
`deriveContextHash` again, and reveals the preimage on Ethereum.

A future use case is WOTS (Winternitz One-Time Signature) seed
derivation — the wallet provides a 32-byte seed via
`deriveContextHash`, and the dApp expands it into WOTS keypairs
in WASM. This would eliminate the separate mnemonic that users
currently manage for Lamport key signing.

---

## 4. Test Vectors

All test vectors use the following BIP-39 mnemonic (no
passphrase):

```
abandon abandon abandon abandon abandon abandon
abandon abandon abandon abandon abandon about
```

BIP-39 seed (hex):
```
5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6
f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d
8d48b2d2ce9e38e4
```

BIP-32 private key at `m/73681862'` (hex):
```
391cdb922097ec9c96fc13cadb01d5745ccf31f5dbec3a3810344071
4779ec85
```

All vectors use `appName = "test-app"`.

SHA-256(UTF8("test-app")) (hex):
```
b58b0cb4ecdea3c65311b4ca8833fe47b6ae0a7500f87a8eb31e8379
d3fe48f1
```

The `info` field for each vector is:
`SHA-256(UTF8("test-app")) || decode_hex(context)`.

### Vector 1

```
appName:        test-app
context (hex):  deadbeef
salt (utf-8):   derive-context-hash
info (hex):     b58b0cb4ecdea3c65311b4ca8833fe47
                b6ae0a7500f87a8eb31e8379d3fe48f1
                deadbeef
output (hex):   3b0e2d90a01122eed8a520648073892f
                6b2d8f4419216023d63cdbd49500fca3
```

### Vector 2

```
appName:        test-app
context (hex):  00
info (hex):     b58b0cb4ecdea3c65311b4ca8833fe47
                b6ae0a7500f87a8eb31e8379d3fe48f1
                00
output (hex):   50775126782c1a5e4d60daa4666b2c75
                90f0b5a445a4115b0abd411467c92597
```

### Vector 3

```
appName:        test-app
context (hex):  00000000000000000000000000000000
                00000000000000000000000000000000
                00000000000000000000000000000000
                00000000000000000000000000000000
                (64 zero bytes)
info (hex):     b58b0cb4ecdea3c65311b4ca8833fe47
                b6ae0a7500f87a8eb31e8379d3fe48f1
                00000000000000000000000000000000
                00000000000000000000000000000000
                00000000000000000000000000000000
                00000000000000000000000000000000
output (hex):   d81e4a91f32eabd34df0e55ca36f26f2
                11af65dfe575b7201c95baaa6608cdd9
```

Vectors verified against Node.js `crypto.hkdf('sha256', ...)`
and a manual HMAC-based implementation.

---

## 5. References

| Resource | Link |
|----------|------|
| HKDF RFC | [RFC 5869][rfc5869] |
| Krawczyk 2010 | [HKDF Scheme][krawczyk] |
| BIP-32 | [HD Wallets][bip32] |
| BIP-39 | [Mnemonic][bip39] |
| BIP-43 | [Purpose Field][bip43] |
| UniSat wallet PR | [wallet#2][unisat2] |
| Salt fix PR | [wallet#3][unisat3] |

[rfc5869]: https://datatracker.ietf.org/doc/html/rfc5869
[krawczyk]: https://eprint.iacr.org/2010/264
[bip32]: https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki
[bip39]: https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki
[bip43]: https://github.com/bitcoin/bips/blob/master/bip-0043.mediawiki
[unisat2]: https://github.com/unisat-wallet/wallet/pull/2
[unisat3]: https://github.com/unisat-wallet/wallet/pull/3
