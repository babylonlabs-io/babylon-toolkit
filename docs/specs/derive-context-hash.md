# `deriveContextHash` Specification

**Spec revision**: 2.0
**Algorithm version**: 1 (salt: `"derive-context-hash"`, no suffix)
**Date**: 2026-05-09
**Authors**: Jerome Wang (Babylon Labs)
**Status**: Draft — supersedes revision 1.0 (per-position outputs; IKM cryptographically separated from spend-authorizing keys)

---

## Changes from revision 1.0

- **IKM source changed.** v1.0 derived IKM from a fixed wallet-level path `m/73681862'`. v2.0 derives IKM at `m/73681862' / coin_type' / account' / change / address_index`, where the `coin_type / account / change / address_index` segments are taken from the connected user leaf. Output rotates per-position. Imported (non-HD) wallets and HD wallets without master-seed access derive IKM via an HMAC-SHA-512 wrap of the connected key ([BIP-85][bip85] pattern).
- **Salt unchanged**: `"derive-context-hash"`.
- **Test vectors restructured.** §4.1 HKDF function-level KAT (unchanged). §4.2 HD-wallet integration KAT (sibling path). §4.3 imported-wallet integration KAT (HMAC wrap).

dApps that persisted v1.0 outputs must re-derive against v2.0.

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
ikm    = derive_ikm(wallet)           (see "IKM" below)
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

**IKM (Input Key Material):** a 32-byte value cryptographically
separated from any spend-authorizing key. Construction depends on
wallet type:

- **HD wallets with verified master-seed access (typically
  mnemonic-imported):** the BIP-32 private key scalar at the
  dedicated 5-level BIP-44-shaped path

  ```
  m / 73681862' / coin_type' / account' / change / address_index
  ```

  where `coin_type / account / change / address_index` are taken
  from the connected user leaf. Example: connected leaf
  `m/44'/0'/0'/0/0` → IKM at `m/73681862'/0'/0'/0/0`. The IKM
  segments `coin_type'` and `account'` are always hardened
  regardless of how the user-leaf path expresses them; only the
  numeric values are reused. The IKM is the raw 32-byte scalar at
  the leaf, big-endian.

- **Imported (raw) private key wallets, and HD wallets that
  cannot verify master-seed access to the BIP-32 tree that
  produced the connected leaf (e.g. xpriv imports — including
  depth-0 xprivs whose original `(coin_type, account, change)`
  context the wallet does not preserve):** the leftmost 32 bytes
  of an HMAC-SHA-512 wrap of the connected key under a fixed
  domain label ([BIP-85][bip85] pattern):

  ```
  ikm = HMAC-SHA-512(
          key = "derive-context-hash-from-k"  (UTF-8, 26 bytes),
          msg = connected_privkey             (32 bytes)
        ) [leftmost 32 bytes]
  ```

  Argument order matches BIP-85: the label is the HMAC key, the
  private key is the HMAC message. (BIP-85 takes the rightmost
  32 bytes of its HMAC output for xprv key material; this spec
  takes the leftmost 32 bytes — the two are not interchangeable.)
  Outputs from this construction are not interoperable with HD
  wallets that have master-seed access; wallets MUST document
  this to users.

The connected leaf's signing key is never used as direct HKDF
input.

If BIP-32 derivation produces an invalid child key (IL ≥ curve
order or resulting key is zero), the wallet MUST return an error
rather than skip to the next index.

**Wallet support requirement.** Wallets with master-seed access
to the root that produced the connected leaf MUST use the
5-level sibling path; falling back to the HMAC-wrap construction
when sibling derivation fails (e.g. firmware policy blocks
purpose `73681862'`) is NOT permitted. The HMAC-wrap construction
is reserved for raw-imported private keys and HD wallets that
genuinely lack master-seed access (e.g. sub-path xpriv imports).
Wallets to which neither construction applies — for example,
watch-only / xpub-only wallets with no private material, or
hardware wallets whose firmware blocks the required derivation —
MUST report this method as unsupported.

**Constant pinning.** `73681862'` is fixed as the 31-bit integer
obtained from the leftmost four bytes of `SHA-256(UTF8("derive-context-hash"))`,
interpreted big-endian and masked with `0x7fffffff`; this
evaluates to `73681862`. This avoids collision with registered
BIP-43 purpose values.

**BIP-39 passphrase.** Wallets that derive seeds from a BIP-39
mnemonic MUST honor the active BIP-39 passphrase, if any, when
deriving IKM. Two wallets restored from the same recovery
phrase but with different passphrases will produce different
outputs; ignoring the passphrase produces incompatible output.

**Output is per-position.** For HD wallets with master access,
IKM rotates with the `(coin_type, account, change,
address_index)` quad of the connected user leaf. Switching the
index, account, or coin yields a different output. Switching
only the BIP-43 purpose (e.g. BIP-44 ↔ BIP-86) at the same
`(coin, account, change, index)` does not rotate IKM, because
the user's purpose segment is replaced by `73681862'` in the IKM
path. The same connected leaf called twice yields the same
output. Imported and master-less HD wallets follow the analogous
property at the per-imported-key level.

**Hardware wallets.** A hardware wallet that supports
`deriveContextHash` MUST run the derivation internally; the
private key MUST NOT leave the secure element. The device MUST
allow derivation under custom BIP-43 purpose `73681862'`
(devices that gate by purpose must allowlist it).

**Salt:** The fixed UTF-8 string `"derive-context-hash"`.

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

### 4.1 HKDF function-level vectors

These vectors pin the pure HKDF composition (the mathematical
mapping from `(ikm, appName, context)` to output). They are
independent of how the wallet sources `ikm` at runtime.

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

#### Vector 1

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

#### Vector 2

```
appName:        test-app
context (hex):  00
info (hex):     b58b0cb4ecdea3c65311b4ca8833fe47
                b6ae0a7500f87a8eb31e8379d3fe48f1
                00
output (hex):   50775126782c1a5e4d60daa4666b2c75
                90f0b5a445a4115b0abd411467c92597
```

#### Vector 3

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

### 4.2 HD-wallet integration vector

Canonical "abandon" mnemonic, empty BIP-39 passphrase. BIP-39
seed (hex):
```
5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6
f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d
8d48b2d2ce9e38e4
```

For a connected user leaf at `(coin=0, account=0, change=0,
index=0)` (e.g. `m/44'/0'/0'/0/0`), the IKM is the BIP-32 private
key scalar at `m/73681862'/0'/0'/0/0` (hex):
```
e8be9d66f2e9634904c07a4e5f663ac1
4a614011780ee5c110b1988223ddd059
```

With `appName = "test-app"`, `context = "deadbeef"`:
```
output (hex):   7cf4ad428083057fb3c344795b8e124b
                e7f3ef521929b1531909e682c1072f29
```

### 4.3 Imported-wallet integration vector

For an imported (or master-less HD) wallet whose connected
private key is (hex):
```
e284129cc0922579a535bbf4d1a3b257
73090d28c909bc0fed73b5e0222cc372
```

The IKM is the leftmost 32 bytes of
`HMAC-SHA-512("derive-context-hash-from-k", connected_privkey)`
(hex):
```
350c0933c706cc78ddef8ba38abcafd1
4f1cc5f94dee7004e994a97455a30863
```

With `appName = "test-app"`, `context = "deadbeef"`:
```
output (hex):   83a44b4012ec2e92831da086b092ace3
                77698bbede4fd4dc54bc162663ed6a7d
```

---

## 5. References

| Resource | Link |
|----------|------|
| HKDF RFC | [RFC 5869][rfc5869] |
| Krawczyk 2010 | [HKDF Scheme][krawczyk] |
| BIP-32 | [HD Wallets][bip32] |
| BIP-39 | [Recovery phrase / seed][bip39] |
| BIP-43 | [Purpose Field][bip43] |
| BIP-85 | [Deterministic Entropy From BIP-32 Keychains][bip85] |
| UniSat wallet PR | [wallet#2][unisat2] |
| Salt fix PR | [wallet#3][unisat3] |

[rfc5869]: https://datatracker.ietf.org/doc/html/rfc5869
[krawczyk]: https://eprint.iacr.org/2010/264
[bip32]: https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki
[bip39]: https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki
[bip43]: https://github.com/bitcoin/bips/blob/master/bip-0043.mediawiki
[bip85]: https://github.com/bitcoin/bips/blob/master/bip-0085.mediawiki
[unisat2]: https://github.com/unisat-wallet/wallet/pull/2
[unisat3]: https://github.com/unisat-wallet/wallet/pull/3
