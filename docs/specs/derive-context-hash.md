# `deriveContextHash` Specification

**Spec revision**: 2.0
**Algorithm version**: 1 (salt: `"derive-context-hash"`, no suffix)
**Date**: 2026-05-11
**Authors**: Jerome Wang (Babylon Labs)
**Status**: Draft — supersedes revision 1.0 (wallet auto-injects network and connected public key into `info`)

---

## Changes from revision 1.0

- **`info` extended with wallet-injected discriminators.** v1.0 used
  `info = SHA-256(appName) || context`. v2.0 makes the wallet inject
  `SHA-256(UTF8(canonicalNetworkName))` (32 bytes) and the 33-byte
  compressed connected public key between the hashed `appName` and the
  dApp-supplied context. The dApp's `deriveContextHash(appName, context)`
  call signature is unchanged; the change is internal to the wallet's
  HKDF input construction. Output becomes per-(key-material, network,
  connected-pubkey, appName, context) automatically — dApps no longer
  need to encode the network or pubkey into context for that scope.
  **Migration property:** the new bytes land in exactly the same
  position as bytes a v1.0 dApp would manually prepend to its context,
  so an app that prepends
  `SHA-256(UTF8(canonicalNetworkName)) || connectedPubkey` to its
  context on a v1.0 wallet produces the bit-identical output as the
  same app on a v2.0 wallet with the prepending removed.
- **IKM source unchanged.** Still `m/73681862'` (HD) or the raw
  imported private key. The user's spending key is still never used
  as direct HKDF input.
- **Salt unchanged**: `"derive-context-hash"`.
- **dApps that persisted v1.0 outputs must re-derive against v2.0.**

---

## Abstract

`deriveContextHash` is a wallet API method that derives a
deterministic 32-byte value from the wallet's key material, the
wallet's current network, the connected public key, an
application name, and an application-provided context string. It
uses HKDF-SHA-256 (IETF RFC 5869) and is designed for cross-wallet
compatibility — any conforming implementation produces the same
output for the same `(key material, network, connected pubkey,
appName, context)` tuple.

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
  Examples: `"babylon-btc-vault"`, `"ordinals-market"`.
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
- Wallet's current network is not one of the canonical Bitcoin
  networks enumerated in [§2.2](#22-derivation-algorithm)
  (`"bitcoin-mainnet"`, `"bitcoin-testnet"`, `"bitcoin-signet"`,
  `"bitcoin-regtest"`). Returned as a distinct error so dApps can
  surface "switch your wallet to a supported Bitcoin network"
  rather than the generic "method not supported".
- User rejects the approval dialog.
- Wallet does not support the method.

**User approval required.** The wallet MUST show a confirmation
dialog before deriving and returning the value. The dialog
MUST display the `appName` and the requesting origin. The
dialog SHOULD also display the context bytes.

### 2.2 Derivation Algorithm

```
ikm    = BIP-32 private key at path m/73681862'
salt   = "derive-context-hash"                          (UTF-8 encoded)
info   = SHA-256(UTF8(appName))                         (32 bytes, fixed)
      || SHA-256(UTF8(canonicalNetworkName))            (32 bytes, fixed)
      || connectedPubkey                                (33 bytes, fixed)
      || context                                        (variable, raw bytes)
length = 32

output = HKDF-SHA-256(ikm, salt, info, length)
```

`info` begins with three fixed-length prefixes — hashed `appName`
(32 bytes, dApp-supplied), hashed canonical network name (32 bytes,
wallet-supplied), and the raw compressed connected public key
(33 bytes, wallet-supplied) — followed by the variable-length context
bytes decoded from hex. The three fixed prefixes occupy a total of
97 bytes at fixed offsets, eliminating length-confusion collisions
across
distinct `(appName, network, connectedPubkey, context)`
combinations.

**`canonicalNetworkName`** is the wallet's current Bitcoin
network, one of:

| Wallet network | `canonicalNetworkName` |
|---|---|
| Bitcoin mainnet | `"bitcoin-mainnet"` |
| Bitcoin testnet (testnet3 / testnet4) | `"bitcoin-testnet"` |
| Bitcoin signet | `"bitcoin-signet"` |
| Bitcoin regtest | `"bitcoin-regtest"` |

A wallet that implements `deriveContextHash` but is currently
connected to a network outside this table (e.g. a Bitcoin-derived
sidechain, or a regional chain the spec doesn't enumerate) MUST
report this as a **distinct "unsupported network" error**, not as
"method not supported" (see [§2.1](#21-api)). This lets a dApp tell
the user "switch your wallet to a supported Bitcoin network"
instead of the unactionable "this wallet doesn't implement the API"
— which would be the wrong diagnosis: the wallet does implement it,
just not for the network the user is currently on. Cross-wallet
portability of `deriveContextHash` outputs is only defined for the
canonical networks above.

Testnet3 and testnet4 share a single `bitcoin-testnet` canonical
name on purpose: BIP-32 derivation is identical across the two
networks, so a wallet that has migrated from testnet3 to testnet4
intentionally produces the same outputs for the same context.
Neither testnet carries production funds, so this stability
preserves recoverable test-state at the cost of a distinction with
no security value.

**`connectedPubkey`** is the **33-byte compressed SEC1
encoding** (`0x02 || x` or `0x03 || x`) of the exact secp256k1
public key returned to the dApp and treated as the active
connected key for this `deriveContextHash` request. If the
wallet exposes multiple accounts/addresses in one session, the
key bound here MUST be the one the wallet considers "currently
selected" at the moment the dApp invokes `deriveContextHash`,
and the approval dialog SHOULD make that explicit to the user.
The compressed form is canonical across Bitcoin wallet APIs
(UniSat, OKX, Phantom, Leather, Magic Eden, Xverse all expose
compressed via their `getPublicKey()` equivalents).

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

The IKM derivation path is fixed regardless of the wallet's
active account or network — all accounts derived from the
same seed share the same IKM. Per-network and per-connected-
public-key rotation is provided automatically by the
wallet-injected `SHA-256(UTF8(canonicalNetworkName))` and
`connectedPubkey` prefixes in `info` (see above) — dApps do
not need to encode either in their `context`. Only
finer-grained app-level rotation (per-deposit, per-session,
per-vault, etc.) belongs in `context`.

**Imported private keys:** Wallets that support imported (non-HD)
private keys MAY offer `deriveContextHash` for those keys. Since
imported keys lack a BIP-32 hierarchy, the wallet MUST use the
raw 32-byte imported private key directly as IKM, skipping BIP-32
derivation. The `info` construction is unchanged — `connectedPubkey`
is the compressed SEC1 form of the imported key's public point.
Outputs from imported keys are not cross-wallet compatible with
HD wallets restored from the same recovery phrase — this is
inherent to imported keys, which have no shared derivation tree.
Wallets MUST clearly document this behavior to users and
application developers.

Note: BIP-39 passphrases produce different seeds from the same
recovery phrase. Two wallets restored from the same recovery
phrase but with different passphrases will produce different
outputs.

**Salt:** The fixed UTF-8 string `"derive-context-hash"`.
Provides domain separation from BIP-32 and other HMAC-based
derivation schemes. The salt is unchanged across revisions
1.0 and 2.0; v2.0 outputs differ because `info` extends v1.0's
`info` with two new fixed-length wallet-injected prefixes.

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
revealing the secret. The canonical layout — specified in
[`derive-vault-secrets.md`][derive-vault-secrets-spec] — encodes
the depositor's x-only BTC public key together with a commitment
over the Pre-PegIn funding outpoints. The per-vault HTLC output
index is NOT carried in the wallet context; it's mixed in through
a separate HKDF-Expand step in the SDK, so a single wallet popup
serves every BTC vault funded by the same Pre-PegIn. The wallet
additionally injects the connected pubkey and network name into
`info` as defense-in-depth on top of the protocol-level pubkey
binding in `context`.

The application calls
`deriveContextHash("babylon-btc-vault", context)`, computes
`SHA-256(deriveContextHash("babylon-btc-vault", context))` to get
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
mapping from `(ikm, salt, info, length)` to output). They are
independent of how a v2.0 wallet builds `info` at runtime —
the `info` bytes are given as opaque inputs. Wallet integration
tests SHOULD target the §4.2 vector instead.

`ikm` (hex, fixed test value):
```
391cdb922097ec9c96fc13cadb01d5745ccf31f5dbec3a3810344071
4779ec85
```

salt: UTF-8 `"derive-context-hash"`.

#### Vector 1

```
info (hex):     b58b0cb4ecdea3c65311b4ca8833fe47
                b6ae0a7500f87a8eb31e8379d3fe48f1
                deadbeef
output (hex):   3b0e2d90a01122eed8a520648073892f
                6b2d8f4419216023d63cdbd49500fca3
```

#### Vector 2

```
info (hex):     b58b0cb4ecdea3c65311b4ca8833fe47
                b6ae0a7500f87a8eb31e8379d3fe48f1
                00
output (hex):   50775126782c1a5e4d60daa4666b2c75
                90f0b5a445a4115b0abd411467c92597
```

#### Vector 3

```
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

### 4.2 Wallet integration vector

This vector pins the full v2.0 `info` construction
(`SHA-256(UTF8(appName)) || SHA-256(UTF8(canonicalNetworkName)) || connectedPubkey || context`). Any conforming
wallet on Bitcoin mainnet, restored from the canonical "abandon"
BIP-39 recovery phrase with an empty passphrase, with the dApp
connected to the BIP-44 leaf `m/44'/0'/0'/0/0`, MUST reproduce
this output.

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

`ikm` = BIP-32 private key at `m/73681862'` (hex):
```
391cdb922097ec9c96fc13cadb01d5745ccf31f5dbec3a3810344071
4779ec85
```

`connectedPubkey` = compressed SEC1 public key of the BIP-44
receive leaf `m/44'/0'/0'/0/0` (hex):
```
03aaeb52dd7494c361049de67cc680e83ebcbbbdbeb13637d92cd845
f70308af5e
```

Wallet inputs:
- `appName = "test-app"`
- `canonicalNetworkName = "bitcoin-mainnet"`
- `context (hex) = "deadbeef"`

Intermediates:
```
SHA-256(UTF8("test-app")):
  b58b0cb4ecdea3c65311b4ca8833fe47
  b6ae0a7500f87a8eb31e8379d3fe48f1

SHA-256(UTF8("bitcoin-mainnet")):
  6ccb47297786bba7fff572abf0cc32bb
  50881925bf01d67a50a981d9774b82dd
```

`info` (hex, 101 bytes = 32 + 32 + 33 + 4, one line per component):
```
b58b0cb4ecdea3c65311b4ca8833fe47b6ae0a7500f87a8eb31e8379d3fe48f1   // SHA-256(UTF8("test-app"))         — 32 bytes
6ccb47297786bba7fff572abf0cc32bb50881925bf01d67a50a981d9774b82dd   // SHA-256(UTF8("bitcoin-mainnet"))  — 32 bytes
03aaeb52dd7494c361049de67cc680e83ebcbbbdbeb13637d92cd845f70308af5e // connectedPubkey                    — 33 bytes
deadbeef                                                            // context                            —  4 bytes
```

`output` (hex):
```
f82ced3be0e29591a7863ece03d65f79
fb494fe0de7203549855f462455df008
```

Vector verified against Node.js `crypto.hkdfSync('sha256',
...)` with `@scure/bip32` BIP-32 derivation.

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
[derive-vault-secrets-spec]: ./derive-vault-secrets.md
