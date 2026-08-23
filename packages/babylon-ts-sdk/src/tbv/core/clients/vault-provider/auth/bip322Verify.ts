/**
 * BIP-322 "simple" signature verification for P2TR key-path and P2WPKH.
 *
 * Mirrors the Rust reference in
 * `btc-vault/crates/btc-signer/src/message.rs` (`verify_bip322_message`
 * and the P2WPKH arm of `verify_pop_witness`, both of which delegate to
 * the `bip322` crate 0.0.10's `verify_simple`).
 *
 * The algorithm:
 *
 *   1. Compute the BIP-322 tagged-hash of the message:
 *        m_hash = SHA256( SHA256(tag) || SHA256(tag) || message )
 *      where tag = "BIP0322-signed-message".
 *
 *   2. Build a virtual "to_spend" transaction with one input (prevout
 *      all-zero txid + 0xFFFFFFFF vout, scriptSig = `OP_0 PUSH32 m_hash`,
 *      sequence = 0) and one output (value 0, scriptPubKey = the signer's
 *      address: P2TR key-path-only, or P2WPKH of the compressed pubkey).
 *
 *   3. Build a "to_sign" transaction that spends to_spend[0] and has a
 *      single `OP_RETURN` output (value 0).
 *
 *   4. Compute the sighash of to_sign input 0: BIP-341 taproot for P2TR
 *      (SIGHASH_DEFAULT 0x00 unless the witness item carried a trailing
 *      SIGHASH_ALL 0x01 byte), BIP-143 with the standard P2WPKH
 *      scriptCode for P2WPKH (SIGHASH_ALL only).
 *
 *   5. Verify the signature: Schnorr against the **tweaked** output key
 *      `Q = P + tap_tweak(P) * G` for P2TR (no merkle root — key-path
 *      only), ECDSA against the compressed pubkey for P2WPKH.
 *
 * `bitcoinjs-lib` handles (2)–(4); `tiny-secp256k1-asmjs` provides
 * the tweak and the Schnorr/ECDSA verifies. Pulling in a full BIP-322
 * library would add a peer dep for what amounts to ~40 lines of glue.
 *
 * @module tbv/core/clients/vault-provider/auth/bip322Verify
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { script as bscript, payments, Transaction } from "bitcoinjs-lib";

import { sha256 } from "@noble/hashes/sha2.js";
import { Buffer } from "buffer";

/** BIP-322 message tag (BIP-340 tagged-hash style). */
const BIP322_TAG = "BIP0322-signed-message";

/** BIP-341 taproot-tweak tag. */
const TAPTWEAK_TAG = "TapTweak";

const X_ONLY_PUBKEY_SIZE = 32;
const SCHNORR_SIG_SIZE = 64;
/** SEC1 compressed pubkey: 0x02/0x03 prefix + 32-byte x coordinate. */
const COMPRESSED_PUBKEY_SIZE = 33;
/**
 * vaultd's P2WPKH BIP-322 verifier accepts ONLY 71/72-byte encoded
 * signatures — DER (70/71B) + sighash byte (`bip322` crate 0.0.10
 * `verify.rs:141-153`). A shorter (short-DER) signature fails ingestion
 * permanently, so this gate must be exactly as strict.
 */
const P2WPKH_ENCODED_SIG_MIN = 71;
const P2WPKH_ENCODED_SIG_MAX = 72;

// NOTE: bitcoinjs-lib v6.x's `Transaction.addOutput` and its sighash
// methods are typed for `Satoshi` (a UInt53 number), not `bigint`.
// Passing `BigInt(0)` triggers a typeforce assertion in `addOutput`
// ("Expected property '1' of type Satoshi, got BigInt 0") which the
// verifiers' try/catch silently turns into `verify -> false`. Use
// plain `0` everywhere.
const ZERO_SATS = 0;

/**
 * BIP-340 tagged hash: `SHA256( SHA256(tag) || SHA256(tag) || data )`.
 * Used for both BIP-322 message hashing and BIP-341 tap-tweak.
 */
function taggedHash(tag: string, data: Uint8Array): Uint8Array {
  const tagBytes = new TextEncoder().encode(tag);
  const tagHash = sha256(tagBytes);
  const preimage = new Uint8Array(tagHash.length * 2 + data.length);
  preimage.set(tagHash, 0);
  preimage.set(tagHash, tagHash.length);
  preimage.set(data, tagHash.length * 2);
  return sha256(preimage);
}

/**
 * Apply BIP-341 taproot tweak to an x-only pubkey with no merkle
 * root (key-path-only address).
 *
 * `tap_tweak = hash_TapTweak(P)`
 * `Q = P + tap_tweak * G` (x-only, even-Y parity)
 *
 * Returns the tweaked 32-byte x-only pubkey, or null if the tweak
 * produces a point-at-infinity or invalid result.
 */
function tweakXOnlyKey(xOnly: Uint8Array): Uint8Array | null {
  if (xOnly.length !== X_ONLY_PUBKEY_SIZE) return null;
  const tweak = taggedHash(TAPTWEAK_TAG, xOnly);
  const tweaked = ecc.xOnlyPointAddTweak(xOnly, tweak);
  return tweaked ? tweaked.xOnlyPubkey : null;
}

/**
 * Build the BIP-322 virtual `to_sign` transaction for a signer
 * scriptPubKey (steps 1–3 above; `bip322` crate 0.0.10 `util.rs:18-85`:
 * both txs version 0, locktime 0, sequence 0, all values 0).
 */
function buildToSignTransaction(
  messageBytes: Uint8Array,
  scriptPubKey: Buffer,
): Transaction {
  const messageHash = taggedHash(BIP322_TAG, messageBytes);

  const toSpend = new Transaction();
  toSpend.version = 0;
  toSpend.locktime = 0;
  // scriptSig: OP_0 (0x00) + OP_PUSHBYTES_32 (0x20) + message_hash (32B)
  const scriptSig = Buffer.concat([
    Buffer.from([0x00, 0x20]),
    Buffer.from(messageHash),
  ]);
  toSpend.addInput(
    Buffer.alloc(32, 0), // prev_txid = 0x0000...0000
    0xffffffff, // prev_vout = 0xFFFFFFFF
    0, // sequence = 0
    scriptSig,
  );
  toSpend.addOutput(scriptPubKey, ZERO_SATS);

  const toSign = new Transaction();
  toSign.version = 0;
  toSign.locktime = 0;
  // Bitcoin txid in natural-byte (little-endian) form.
  toSign.addInput(toSpend.getHash(), 0, 0);
  toSign.addOutput(Buffer.from([0x6a]), ZERO_SATS); // OP_RETURN

  return toSign;
}

/**
 * Verify a BIP-322 "simple" P2TR key-path signature over an arbitrary
 * byte message.
 *
 * @internal Consumed by `verifyServerIdentity` (VP auth) and
 * `verifyPopWitness` (PoP pre-registration check), and exposed so the
 * golden-vector test suite can pin the verifier independently.
 *
 * @param messageBytes - The bytes that were signed (e.g. a CBOR-encoded
 *                       payload). Not pre-hashed; this function applies
 *                       the BIP-322 tagged hash internally.
 * @param xOnlyPubkey  - 32-byte x-only pubkey of the signer (pre-tweak).
 * @param signature    - 64-byte raw Schnorr signature (BIP-340), as
 *                       emitted by a key-path witness. The trailing
 *                       sighash byte of a 65-byte witness item is not
 *                       part of it — pass it as `hashType` instead.
 * @param hashType     - BIP-341 sighash type the signature commits to.
 *                       `SIGHASH_DEFAULT` (0x00) for a 64-byte witness
 *                       item, `SIGHASH_ALL` (0x01) for a 65-byte one.
 * @returns `true` if the signature verifies against the address
 *          derived from `xOnlyPubkey`; `false` otherwise.
 */
export function verifyBip322Simple(
  messageBytes: Uint8Array,
  xOnlyPubkey: Uint8Array,
  signature: Uint8Array,
  hashType: number = Transaction.SIGHASH_DEFAULT,
): boolean {
  if (xOnlyPubkey.length !== X_ONLY_PUBKEY_SIZE) return false;
  if (signature.length !== SCHNORR_SIG_SIZE) return false;
  // Only the two types a BIP-322 witness may carry. SIGHASH_NONE/SINGLE and the
  // ANYONECANPAY variants would verify here but are rejected downstream.
  if (
    hashType !== Transaction.SIGHASH_DEFAULT &&
    hashType !== Transaction.SIGHASH_ALL
  ) {
    return false;
  }

  // Any exception from the underlying crypto libraries (e.g. the
  // `Expected Point` error `tiny-secp256k1` throws when the supplied
  // 32 bytes don't represent a valid x-coordinate on secp256k1) is
  // treated as a verification failure rather than propagated — a
  // verifier MUST return a boolean, not raise.
  try {
    // scriptPubKey for the signer's P2TR key-path-only address.
    // bitcoinjs-lib's `payments.p2tr({ internalPubkey })` computes the
    // tweak and produces the `OP_1 <tweaked_xonly>` output script.
    const p2tr = payments.p2tr({
      internalPubkey: Buffer.from(xOnlyPubkey),
    });
    if (!p2tr.output) return false;
    const scriptPubKey = p2tr.output;

    const toSign = buildToSignTransaction(messageBytes, scriptPubKey);

    // Taproot sighash for to_sign input 0.
    const sighash = toSign.hashForWitnessV1(
      0,
      [scriptPubKey],
      [ZERO_SATS],
      hashType,
    );

    // Tweak the x-only pubkey (no merkle root) and verify Schnorr.
    const tweakedXOnly = tweakXOnlyKey(xOnlyPubkey);
    if (!tweakedXOnly) return false;

    return ecc.verifySchnorr(sighash, tweakedXOnly, signature);
  } catch {
    return false;
  }
}

/**
 * Verify a BIP-322 "simple" P2WPKH signature over an arbitrary byte
 * message, mirroring the verifier vaultd runs on a two-item PoP witness
 * (`bip322` crate 0.0.10 `verify.rs:102-186 verify_full_p2wpkh`).
 *
 * @internal Consumed by `verifyPopWitness` for Native SegWit software
 * wallets, and exposed so the BIP-322 official-vector test suite can pin
 * the verifier independently.
 *
 * @param compressedPubkey - 33-byte SEC1 compressed pubkey of the signer
 *                           (witness item 1). The address is derived from
 *                           it; network affects only bech32 encoding, not
 *                           script or sighash (`message.rs:125-127`).
 * @param encodedSignature - Witness item 0: DER signature with trailing
 *                           sighash byte, 71 or 72 bytes, SIGHASH_ALL only
 *                           (`verify.rs:141-161`).
 * @returns `true` if the signature verifies against the P2WPKH address of
 *          `compressedPubkey`; `false` otherwise.
 */
export function verifyBip322P2wpkhSimple(
  messageBytes: Uint8Array,
  compressedPubkey: Uint8Array,
  encodedSignature: Uint8Array,
): boolean {
  if (compressedPubkey.length !== COMPRESSED_PUBKEY_SIZE) return false;
  if (
    encodedSignature.length < P2WPKH_ENCODED_SIG_MIN ||
    encodedSignature.length > P2WPKH_ENCODED_SIG_MAX
  ) {
    return false;
  }
  // Any exception below (strict-DER decode, malformed pubkey) is a
  // verification failure, not an error — a verifier returns a boolean.
  try {
    // Full curve-point parse, as `PublicKey::from_slice` (`verify.rs:82-83`).
    if (!ecc.isPointCompressed(compressedPubkey)) return false;

    // Strict DER decode, then SIGHASH_ALL only — deliberately NARROWER than
    // `verify.rs:156-161` (its from_consensus maps more bytes to All); host-stricter is safe.
    const { signature, hashType } = bscript.signature.decode(
      Buffer.from(encodedSignature),
    );
    if (hashType !== Transaction.SIGHASH_ALL) return false;

    // scriptPubKey = OP_0 PUSH20 hash160(pubkey) (`message.rs:127 Address::p2wpkh`).
    const p2wpkh = payments.p2wpkh({ pubkey: Buffer.from(compressedPubkey) });
    if (!p2wpkh.output || !p2wpkh.hash) return false;

    const toSign = buildToSignTransaction(messageBytes, p2wpkh.output);

    // BIP-143 sighash with the standard P2WPKH scriptCode
    // `OP_DUP OP_HASH160 <20B> OP_EQUALVERIFY OP_CHECKSIG` and value 0
    // (`verify.rs:163-173 p2wpkh_signature_hash`; scriptCode template per
    // bitcoinjs-lib's own P2WPKH signer, `src/psbt.js:1245-1255`).
    const scriptCode = payments.p2pkh({ hash: p2wpkh.hash }).output;
    if (!scriptCode) return false;
    const sighash = toSign.hashForWitnessV0(0, scriptCode, ZERO_SATS, hashType);

    // strict=true rejects high-S, as libsecp256k1's verify does
    // (`verify.rs:180-182`; secp256k1 crate `ecdsa/mod.rs:194`).
    return ecc.verify(sighash, compressedPubkey, signature, true);
  } catch {
    return false;
  }
}
