/**
 * BIP-322 "simple" signature verification for P2TR key-path.
 *
 * Mirrors the Rust reference in
 * `btc-vault/crates/btc-signer/src/message.rs::verify_bip322_message`
 * (which delegates to `rust-bitcoin::bip322::verify_simple` for a
 * P2TR key-path-only address with no merkle root).
 *
 * The algorithm:
 *
 *   1. Compute the BIP-322 tagged-hash of the message:
 *        m_hash = SHA256( SHA256(tag) || SHA256(tag) || message )
 *      where tag = "BIP0322-signed-message".
 *
 *   2. Build a virtual "to_spend" transaction with one input (prevout
 *      all-zero txid + 0xFFFFFFFF vout, scriptSig = `OP_0 PUSH32 m_hash`,
 *      sequence = 0) and one output (value 0, scriptPubKey = P2TR for
 *      the signer's x-only pubkey).
 *
 *   3. Build a "to_sign" transaction that spends to_spend[0] and has a
 *      single `OP_RETURN` output (value 0).
 *
 *   4. Compute the BIP-341 taproot sighash of to_sign input 0 with
 *      SIGHASH_DEFAULT (0x00).
 *
 *   5. Verify the 64-byte Schnorr signature against the **tweaked**
 *      output key `Q = P + tap_tweak(P) * G`, where `tap_tweak(P) =
 *      hash_TapTweak(serialize_x_only(P))` (no merkle root — key-path
 *      only).
 *
 * `bitcoinjs-lib` handles (2)–(4); `tiny-secp256k1-asmjs` provides
 * the tweak and Schnorr verify. Pulling in a full BIP-322 library
 * would add a peer dep for what amounts to ~40 lines of glue.
 *
 * @module tbv/core/clients/vault-provider/auth/bip322Verify
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { payments, Transaction } from "bitcoinjs-lib";

import { Buffer } from "buffer";
import { sha256 } from "@noble/hashes/sha2.js";

/** BIP-322 message tag (BIP-340 tagged-hash style). */
const BIP322_TAG = "BIP0322-signed-message";

/** BIP-341 taproot-tweak tag. */
const TAPTWEAK_TAG = "TapTweak";

const X_ONLY_PUBKEY_SIZE = 32;
const SCHNORR_SIG_SIZE = 64;

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
 * Verify a BIP-322 "simple" P2TR key-path signature over an arbitrary
 * byte message.
 *
 * @param messageBytes - The bytes that were signed (e.g. a CBOR-encoded
 *                       payload). Not pre-hashed; this function applies
 *                       the BIP-322 tagged hash internally.
 * @param xOnlyPubkey  - 32-byte x-only pubkey of the signer (pre-tweak).
 * @param signature    - 64-byte raw Schnorr signature (BIP-340), as
 *                       emitted by a key-path witness with
 *                       SIGHASH_DEFAULT.
 * @returns `true` if the signature verifies against the address
 *          derived from `xOnlyPubkey`; `false` otherwise.
 */
export function verifyBip322Simple(
  messageBytes: Uint8Array,
  xOnlyPubkey: Uint8Array,
  signature: Uint8Array,
): boolean {
  if (xOnlyPubkey.length !== X_ONLY_PUBKEY_SIZE) return false;
  if (signature.length !== SCHNORR_SIG_SIZE) return false;

  // Any exception from the underlying crypto libraries (e.g. the
  // `Expected Point` error `tiny-secp256k1` throws when the supplied
  // 32 bytes don't represent a valid x-coordinate on secp256k1) is
  // treated as a verification failure rather than propagated — a
  // verifier MUST return a boolean, not raise.
  try {
    // Step 1: BIP-322 tagged hash of the message.
    const messageHash = taggedHash(BIP322_TAG, messageBytes);

    // Step 2: scriptPubKey for the signer's P2TR key-path-only address.
    // bitcoinjs-lib's `payments.p2tr({ internalPubkey })` computes the
    // tweak and produces the `OP_1 <tweaked_xonly>` output script.
    const p2tr = payments.p2tr({
      internalPubkey: Buffer.from(xOnlyPubkey),
    });
    if (!p2tr.output) return false;
    const scriptPubKey = p2tr.output;

    // Step 3: build to_spend virtual tx.
    //
    // NOTE: bitcoinjs-lib v6.x's `Transaction.addOutput` and
    // `hashForWitnessV1` are typed for `Satoshi` (a UInt53 number),
    // not `bigint`. Passing `BigInt(0)` triggers a typeforce
    // assertion in `addOutput` ("Expected property '1' of type
    // Satoshi, got BigInt 0") which our outer try/catch silently
    // turns into `verify -> false`. Use plain `0` everywhere.
    const ZERO_SATS = 0;
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
      0xffffffff,          // prev_vout = 0xFFFFFFFF
      0,                   // sequence = 0
      scriptSig,
    );
    toSpend.addOutput(scriptPubKey, ZERO_SATS);

    // Step 4: build to_sign virtual tx spending to_spend[0].
    const toSign = new Transaction();
    toSign.version = 0;
    toSign.locktime = 0;
    // Bitcoin txid in natural-byte (little-endian) form.
    const toSpendTxid = toSpend.getHash();
    toSign.addInput(toSpendTxid, 0, 0);
    toSign.addOutput(Buffer.from([0x6a]), ZERO_SATS); // OP_RETURN

    // Step 5: taproot sighash for to_sign input 0 (SIGHASH_DEFAULT).
    const sighash = toSign.hashForWitnessV1(
      0,
      [scriptPubKey],
      [ZERO_SATS],
      Transaction.SIGHASH_DEFAULT,
    );

    // Step 6: tweak the x-only pubkey (no merkle root) and verify Schnorr.
    const tweakedXOnly = tweakXOnlyKey(xOnlyPubkey);
    if (!tweakedXOnly) return false;

    return ecc.verifySchnorr(sighash, tweakedXOnly, signature);
  } catch {
    return false;
  }
}
