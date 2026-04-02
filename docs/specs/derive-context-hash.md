# `deriveContextHash` Specification

**Spec revision**: 0.8-draft
**Algorithm version**: 0 (salt: `"derive-context-hash"`, no suffix)
**Date**: 2026-04-02
**Authors**: Jerome Wang (Babylon Labs)
**Status**: Draft — pending auditor review

---

## Abstract

`deriveContextHash` is a wallet API method that derives a deterministic 32-byte value from the wallet's key material and an application-provided context string. It uses HKDF-SHA-256 (RFC 5869) and is designed for cross-wallet compatibility — any conforming implementation produces the same output for the same key material and context.

The method is generic. The wallet has no knowledge of what the derived value is used for. dApps provide an opaque context and receive a deterministic output.

---

## 1. Motivation

dApps sometimes need a deterministic secret tied to the user's wallet — one that can be reproduced across sessions and devices without manual storage. Examples include:

- **HTLC preimages** — commit a hash at deposit time, reveal the preimage days later to complete activation.
- **One-time signature seeds** — derive seed material for signature schemes (WOTS, Lamport) without the user managing a separate mnemonic.
- **Deterministic identifiers** — generate wallet-bound values that are stable across sessions.

Today, dApps typically generate random secrets in the browser and ask users to save them manually. This is error-prone and has no recovery path. `deriveContextHash` replaces this pattern: the wallet derives the value deterministically from its own key material, so the same context always produces the same output — no manual step needed.

---

## 2. Specification

### 2.1 API

```
wallet.deriveContextHash(context: string, options?: {
  display?: {
    title?: string;
    description?: string;
  };
}) → Promise<string>
```

**Parameters:**
- `context` — hex-encoded byte string (even-length, lowercase, no `0x` prefix). Acts as a domain separator; different contexts produce independent outputs. Must not be empty.
- `options` — optional configuration object. Does not affect the derived output.
  - `display` — optional object with fields for the wallet to show in the approval dialog.
    - `title` — short label for the operation (e.g. `"Vault Deposit Secret"`).
    - `description` — longer explanation of what the derived value will be used for (e.g. `"Derive a secret for vault deposit activation"`).

**Returns:**
- Hex-encoded 32-byte derived value (64 lowercase hex characters).

**Errors:**
- Context is empty, odd-length, contains non-hex characters (including uppercase `A–F`), has a `0x` prefix, or exceeds 1024 bytes (2048 hex characters).
- User rejects the approval dialog.
- Wallet does not support the method.

**User approval required.** The wallet MUST show a confirmation dialog before deriving and returning the value. The dialog SHOULD display the requesting origin. If `display` is provided, the wallet SHOULD show the title and description to help the user understand what they are approving.

### 2.2 Derivation Algorithm

```
ikm    = BIP-32 private key at path m/44'/0'/0'/60888'
salt   = "derive-context-hash"                   (UTF-8 encoded)
info   = context                                  (raw bytes, decoded from hex input)
length = 32

output = HKDF-SHA-256(ikm, salt, info, length)
```

**IKM (Input Key Material):** The raw 32-byte private key scalar at BIP-32 derivation path `m/44'/0'/0'/60888'` (all indices hardened), using standard BIP-32 derivation on secp256k1. This is the 32-byte big-endian scalar `k` only — excluding chain code, depth, fingerprint, child number, and any serialization prefix. If BIP-32 derivation at any level produces an invalid child key (IL ≥ curve order or resulting key is zero), the wallet MUST return an error rather than skip to the next index.

The derivation path is dedicated to this method — it MUST NOT be used for signing or any other BIP-32 derivation. Using a BIP-32 derived key (rather than the raw BIP-39 seed) ensures hardware wallets can run the entire derivation internally on the secure element without exporting the private key. This requires a dedicated device app; the stock Bitcoin app on Ledger/Trezor does not support this operation.

The derivation path is fixed regardless of the wallet's active account or network. All accounts derived from the same seed share the same `deriveContextHash` root. Applications that need per-account isolation MUST encode an account identifier in their context.

Note: BIP-39 passphrases produce different seeds from the same mnemonic. Two wallets with the same mnemonic but different passphrases will produce different outputs.

**Salt:** The fixed UTF-8 string `"derive-context-hash"`. Provides domain separation from BIP-32 and other HMAC-based derivation schemes. For future revisions, the `-v1`, `-v2`, etc. suffix can be appended to the salt to indicate the version of the scheme. The current `derive-context-hash` salt is version 0 without a suffix.

**Info:** The raw context bytes decoded from the hex input. This is the only caller-controlled parameter and determines the output. Maximum context length is 1024 bytes (2048 hex characters). Wallets MUST reject contexts exceeding this limit.

**Length:** 32 bytes (256 bits).

### 2.3 HKDF-SHA-256

HKDF (RFC 5869) is a two-stage key derivation function:

1. **Extract:** `PRK = HMAC-SHA-256(salt, ikm)` — concentrates the entropy of the IKM into a fixed-length pseudorandom key.
2. **Expand:** `output = HMAC-SHA-256(PRK, info || 0x01)` — derives the output keyed on the context. (For 32-byte output, only one HMAC block is needed.)

Implementations SHOULD use a well-audited HKDF library (e.g. `@noble/hashes/hkdf`, OpenSSL, libsodium). Implementations SHOULD zero intermediate key material (PRK) after use where the runtime permits (native/firmware). In garbage-collected environments (JavaScript), explicit zeroization is best-effort.

---

## 3. Example Use Case: Babylon Vault Deposits

This section is informational — it describes how Babylon uses `deriveContextHash` as a concrete example.

Babylon's vault deposit flow requires depositors to commit to a secret at deposit time and reveal that same secret days or weeks later to activate the vault. The secret is the preimage of a SHA-256 hash embedded in an HTLC script on Bitcoin.

At deposit time, the dApp calls `deriveContextHash` with a context constructed from on-chain vault parameters. The dApp computes `SHA-256(output)` and embeds the hash in the HTLC. Days or weeks later, the user returns to activate — the dApp reconstructs the same context from on-chain state, calls `deriveContextHash` again, and reveals the original secret on Ethereum.

The context construction is application-defined. Babylon uses on-chain vault state to ensure the context is reproducible without stored data.

A future use case is WOTS (Winternitz One-Time Signature) seed derivation — the wallet provides a 32-byte seed via `deriveContextHash`, and the dApp expands it into WOTS keypairs in WASM. This would eliminate the separate mnemonic that users currently manage for Lamport key signing.

---

## 4. Test Vectors

All test vectors use the following BIP-39 mnemonic (no passphrase):

```
abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
```

BIP-39 seed (hex):
```
5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4
```

BIP-32 private key at `m/44'/0'/0'/60888'` (hex):
```
064e8a85d0048189bc17e58379d37839ed12e3b56563485993aa587a9ec310e1
```

### Vector 1

```
context (hex):  deadbeef
salt (utf-8):   derive-context-hash
output (hex):   4c7a42f554f857afdd75d546baf6a5c31374dae86d0fe4e71171ccad2f67bd0f
```

### Vector 2

```
context (hex):  00
output (hex):   220f0c3bd7550d90c04e02f8d38d5308e369e37e058a932f19f46b9de2ca6f2c
```

### Vector 3

```
context (hex):  0000000000000000000000000000000000000000000000000000000000000000
                0000000000000000000000000000000000000000000000000000000000000000
                (64 zero bytes — stress test for long context)
output (hex):   3759445ff56682405d433e1c6ada92c17a861601eb105e9058d380d0b915591a
```

Vectors verified against Node.js `crypto.hkdf('sha256', ...)` and a manual HMAC-based implementation.

---

## 5. References

| Resource | Link |
|----------|------|
| HKDF RFC | [RFC 5869](https://datatracker.ietf.org/doc/html/rfc5869) |
| Krawczyk 2010 | [Cryptographic Extraction and Key Derivation: The HKDF Scheme](https://eprint.iacr.org/2010/264) |
| BIP-32 HD Wallets | [BIP-32](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki) |
| BIP-39 Mnemonic | [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) |
| UniSat wallet PR | [unisat-wallet/wallet#2](https://github.com/unisat-wallet/wallet/pull/2) |
| Salt fix PR | [unisat-wallet/wallet#3](https://github.com/unisat-wallet/wallet/pull/3) |
