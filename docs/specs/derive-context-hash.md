# `deriveContextHash` Specification

**Spec revision**: 2.0
**Algorithm version**: 1 (salt: `"derive-context-hash"`, no suffix)
**Date**: 2026-05-06
**Authors**: Jerome Wang (Babylon Labs)
**Status**: Draft — supersedes revision 1.0 (changes IKM source from a fixed BIP-32 path to the connected leaf's private key)

---

## Changes from revision 1.0

- **IKM source changed.** In v1.0, HD wallets derived IKM from a fixed BIP-32 path `m/73681862'` from the seed root, making the output wallet-level (identical across all accounts under the same seed). In v2.0, HD wallets derive IKM from the **connected leaf private key** at the BIP-32 receive-address path (e.g. `m/44'/0'/0'/0/0` for the first receive address of BIP-44 account 0). Output is **per-public-key**: different connected receive addresses (different leaf pubkeys) produce different outputs.
- **Imported wallets unchanged.** They already used the raw imported private key as IKM. v2.0 keeps this. HD and imported are symmetric: one connected public key = one IKM = one output.
- **Salt unchanged**: `"derive-context-hash"`. The IKM-source change alone produces different outputs from v1.0; no salt domain separation needed. The API is `@experimental` and the rollout is coordinated, so no version-discovery mechanism is added.
- **Test vectors restructured.** §4.1 keeps function-level KAT vectors that pin the HKDF composition; §4.2 gives a new HD-wallet integration KAT for the v2.0 IKM source.

A wallet that conformed to v1.0 will produce different outputs than a wallet that conforms to v2.0 for the same recovery phrase and `(appName, context)`. dApps that persisted v1.0 outputs must re-derive against v2.0.

---

## Abstract

`deriveContextHash` is a wallet API method that derives a
deterministic 32-byte value from the wallet's key material, an
application name, and an application-provided context string. It
uses HKDF-SHA-256 (IETF RFC 5869) and is designed for cross-wallet
compatibility — any conforming implementation produces the same
output for the same key material, application name, and context.

The method is generic. The wallet has no knowledge of what the
derived value is used for. Applications provide an application
name and an opaque context; the wallet displays the application
name in its approval dialog and returns a deterministic output.

---

## 1. Motivation

Applications need a deterministic secret tied to the user's
wallet — one that can be reproduced across sessions and devices
without manual storage. Examples include:

- **Hashlock pre-images** — commit to a secret that can be
  later revealed.
- **One-time signature seeds** — derive seed material for
  signature schemes (WOTS, Lamport) without the user managing
  a separate secret.
- **Deterministic identifiers** — generate wallet-bound values
  that are stable across sessions.

`deriveContextHash` enables applications to avoid generating
secrets for users in the browser directly, which is error-prone
and offers no recovery path.

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
  two applications using different `appName` values will never
  produce the same output, even if their `context` values
  collide. The wallet MUST display `appName` in the approval
  dialog so the user can see which application is requesting
  the derivation. `appName` is caller-supplied and is not, by
  itself, an authenticated identity signal; a malicious
  application can choose any allowed string. Wallets MUST
  reject `appName` values containing characters outside the
  allowed set.
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
ikm    = the connected leaf's 32-byte private key
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

**IKM (Input Key Material):** the **connected leaf's** raw
32-byte private key scalar (big-endian, excluding chain code,
depth, fingerprint, child number, and any serialization prefix).
Specifically:

- **HD wallets (mnemonic / xpriv):** the BIP-32 leaf private key
  at the receive-address path the dApp is connected to — e.g.
  `m/44'/0'/0'/0/0` for the first receive address of BIP-44
  account 0; `m/86'/0'/0'/0/0` for the first Taproot receive
  address. The IKM is the 32-byte private key scalar at that
  leaf. The wallet selects the path from its currently active
  receive address.
- **Imported (raw) private key wallets:** the raw 32-byte
  imported private key, used directly as IKM (no BIP-32
  derivation — imported keys lack a hierarchy).

If BIP-32 derivation produces an invalid child key (IL ≥ curve
order or resulting key is zero), the wallet MUST return an error
rather than skip to the next index.

**Output is per-public-key.** Each unique connected leaf public
key produces a unique output for the same `(appName, context)`.
Switching the connected receive address — to a different index,
account, address type, network, or wallet — yields a different
output. The same connected leaf called twice yields the same
output. Two wallets that share the same recovery phrase, the
same BIP-39 passphrase, and connect to the same leaf path
produce the same output.

**Hardware wallets.** A hardware wallet that supports
`deriveContextHash` MUST run the derivation internally; the
private key MUST NOT leave the secure element. The IKM is the
BIP-32 leaf private key at the receive-address path specified by
the host (the same path the device is willing to sign for). If
the host-supplied path is outside the device's allowed
set, the device MUST refuse. WebAuthn's PRF / `hmac-secret`
extension is a related precedent.

**Salt:** The fixed UTF-8 string `"derive-context-hash"`.
Provides domain separation from BIP-32 and other HMAC-based
derivation schemes. For future revisions, a `-v2`, `-v3`, etc.
suffix can be appended to the salt to indicate the version of
the scheme. The current `derive-context-hash` salt covers both
revisions 1.0 and 2.0 of this spec — they differ in IKM source
only, which already produces independent outputs.

**Length:** 32 bytes (256 bits).

### 2.3 Context Encoding Guidance

The `context` field is opaque bytes from the wallet's
perspective, but applications constructing multi-field contexts
SHOULD use a canonical encoding to avoid ambiguity. Recommended
approach: length-prefix each field.

```
context = len(field1) || field1 || len(field2) || field2 || ...
```

Where `len` is the byte length encoded as a 4-byte big-endian
unsigned integer. This prevents concatenation collisions (e.g.
fields `"AB" + "CD"` vs `"A" + "BCD"` producing identical
context bytes).

For fixed-length fields (txids, public keys), length prefixes
are optional but still recommended for consistency. Applications
MUST NOT rely on the wallet to parse or validate context
structure —
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

## 3. Example Use Case: Babylon Trustless Bitcoin Vault Deposits

This section is informational — it describes how Babylon uses
`deriveContextHash` as a concrete example.

Babylon's trustless Bitcoin vault deposit flow requires
depositors to commit to a secret and reveal that same secret
later during activation. The secret is the preimage of a
SHA-256 hash embedded in a Bitcoin hashlock script.

Babylon constructs the context from deterministic values that
are available both when creating the deposit and later when
revealing the secret, for example:

```
context = (dummyPrePeginTxid, htlcVout, depositorPubkey)
```

The application calls
`deriveContextHash("babylon-vault", context)`, computes
`SHA-256(deriveContextHash("babylon-vault", context))` to get
the hashlock, and later reconstructs the same context from
on-chain state to derive and reveal the same preimage on
Ethereum.

WOTS (Winternitz One-Time Signature) seed derivation also uses
this primitive — the wallet provides a 32-byte root via
`deriveContextHash`, and the application expands it into WOTS
keypairs locally. This eliminates the separate secret that
users would otherwise have to manage for one-time-signature
schemes.

---

## 4. Test Vectors

The vectors in this section pin the HKDF function-level
composition (i.e. the mathematical mapping from
`(ikm, appName, context)` to output). They are independent of
how a wallet sources `ikm` at runtime — the `ikm` value below is
just an opaque fixed 32-byte test value treated as already-known
input. Wallet integration tests SHOULD NOT target the §4.1
fixture — that value exists only to pin the HKDF math. See §4.2
for the canonical HD-wallet integration vector (mnemonic →
BIP-32 leaf private key → output) that wallets should reproduce.

### 4.1 HKDF function-level vectors

`ikm` (hex, fixed test value):
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

### 4.2 HD-wallet integration example

The following example shows how a conforming HD wallet derives
IKM from the canonical "abandon" recovery phrase (empty
passphrase). Normative for any wallet connected to the first
receive address of BIP-44 account 0; informative for other paths.

BIP-39 mnemonic:
```
abandon abandon abandon abandon abandon abandon abandon
abandon abandon abandon abandon about
```

BIP-39 seed (no passphrase, hex):
```
5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6
f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d
8d48b2d2ce9e38e4
```

For a wallet connected to the first receive address of BIP-44
Bitcoin account 0, the leaf is at `m/44'/0'/0'/0/0` and its
private key (hex) is:
```
e284129cc0922579a535bbf4d1a3b25773090d28c909bc0fed73b5e0
222cc372
```

Using that private key as `ikm`, with `appName = "test-app"`
and `context = "deadbeef"`:
```
output (hex):   650b3fa2cf958ecd258544af2b812c3e
                8a3f4f75ea5d030cb4dd175da551e356
```

A wallet that connects to a different receive address under
the same account (e.g. `m/44'/0'/0'/0/1`) yields a different
leaf private key and a different output. Same for switching
the address type (`m/86'/0'/0'/0/0`), network (`m/44'/1'/...`),
account index (`m/44'/0'/1'/0/0`), or BIP-39 passphrase.

---

## 5. References

| Resource | Link |
|----------|------|
| HKDF RFC | [RFC 5869][rfc5869] |
| Krawczyk 2010 | [HKDF Scheme][krawczyk] |
| BIP-32 | [HD Wallets][bip32] |
| BIP-39 | [Recovery phrase / seed][bip39] |
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
