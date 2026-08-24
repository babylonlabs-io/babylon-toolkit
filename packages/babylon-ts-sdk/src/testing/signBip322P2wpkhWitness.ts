/**
 * Test-support BIP-322 "simple" P2WPKH signer.
 *
 * Produces the consensus-encoded two-item witness `[DER sig ‖ 0x01,
 * compressed pubkey]` that a Native SegWit software wallet returns for
 * `signMessage(..., "bip322-simple")`. The virtual to_spend/to_sign
 * construction follows the `bip322` crate 0.0.10 (`util.rs:18-85`) — the
 * same reference the production verifier
 * (`tbv/core/clients/vault-provider/auth/bip322Verify.ts`) mirrors, and
 * the BIP-322 official vectors pin.
 *
 * Conscious call: `./testing` deliberately depends on the Bitcoin stack
 * (bitcoinjs-lib was already in this entry's graph via MockBitcoinWallet;
 * tiny-secp256k1-asmjs is new here) — out of scope for the CLAUDE.md §9
 * optional-BTC split.
 *
 * Test-only: never feed real key material to this module.
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { sha256 } from "@noble/hashes/sha2.js";
import { script as bscript, payments, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

/** BIP-322 message tag (BIP-340 tagged-hash style). */
const BIP322_TAG = "BIP0322-signed-message";
const SIGHASH_ALL = 0x01;
const ZERO_SATS = 0;
/**
 * vaultd accepts only 71/72-byte encoded signatures (`bip322` crate 0.0.10
 * `verify.rs:141-153`); a short-DER signature (~0.4% of draws) is ground
 * away by re-signing with fresh entropy. 100 attempts bounds the failure
 * probability around 0.004^100.
 */
const MIN_ENCODED_SIG_BYTES = 71;
const MAX_SIGN_GRIND_ATTEMPTS = 100;

// Wire fields of the virtual to_spend/to_sign transactions (`bip322`
// crate 0.0.10 `util.rs:18-85`).
const BIP322_TX_VERSION = 0;
const BIP322_TX_LOCKTIME = 0;
const BIP322_INPUT_SEQUENCE = 0;
/** to_spend prevout: all-zero 32-byte txid at index 0xFFFFFFFF (`util.rs:18-85`). */
const TO_SPEND_PREVOUT_TXID_BYTES = 32;
const TO_SPEND_PREVOUT_INDEX = 0xffffffff;
/** to_sign spends to_spend's only output (`util.rs:18-85`). */
const TO_SPEND_OUTPUT_INDEX = 0;
const OP_0 = 0x00;
/** Direct push of the 32-byte tagged message hash. */
const OP_PUSHBYTES_32 = 0x20;
const OP_RETURN = 0x6a;
/** Consensus P2WPKH witness: exactly [signature, pubkey]. */
const P2WPKH_WITNESS_ITEMS = 2;
/** Grinding: 32-byte extra-entropy buffer, attempt counter at offset 0. */
const GRIND_ENTROPY_BYTES = 32;
const GRIND_COUNTER_OFFSET = 0;

/**
 * Sign `messageBytes` as a BIP-322 "simple" P2WPKH proof with `privateKey`
 * and return the consensus-encoded two-item witness
 * (`0x02 ‖ len ‖ sig ‖ 0x21 ‖ pubkey`).
 */
export function signBip322P2wpkhWitness(
  messageBytes: Uint8Array,
  privateKey: Uint8Array,
): Uint8Array {
  const pubkey = ecc.pointFromScalar(privateKey, true);
  if (!pubkey) {
    throw new Error("signBip322P2wpkhWitness: invalid private key");
  }

  // m_hash = SHA256( SHA256(tag) ‖ SHA256(tag) ‖ message )
  const tagHash = sha256(new TextEncoder().encode(BIP322_TAG));
  const messageHash = sha256(
    Buffer.concat([tagHash, tagHash, Buffer.from(messageBytes)]),
  );

  const p2wpkh = payments.p2wpkh({ pubkey: Buffer.from(pubkey) });
  if (!p2wpkh.output || !p2wpkh.hash) {
    throw new Error("signBip322P2wpkhWitness: could not derive P2WPKH script");
  }

  // to_spend / to_sign per bip322 crate util.rs:18-85.
  const toSpend = new Transaction();
  toSpend.version = BIP322_TX_VERSION;
  toSpend.locktime = BIP322_TX_LOCKTIME;
  toSpend.addInput(
    Buffer.alloc(TO_SPEND_PREVOUT_TXID_BYTES, 0),
    TO_SPEND_PREVOUT_INDEX,
    BIP322_INPUT_SEQUENCE,
    Buffer.concat([
      Buffer.from([OP_0, OP_PUSHBYTES_32]),
      Buffer.from(messageHash),
    ]),
  );
  toSpend.addOutput(p2wpkh.output, ZERO_SATS);
  const toSign = new Transaction();
  toSign.version = BIP322_TX_VERSION;
  toSign.locktime = BIP322_TX_LOCKTIME;
  toSign.addInput(
    toSpend.getHash(),
    TO_SPEND_OUTPUT_INDEX,
    BIP322_INPUT_SEQUENCE,
  );
  toSign.addOutput(Buffer.from([OP_RETURN]), ZERO_SATS);

  // BIP-143 sighash with the standard P2WPKH scriptCode, value 0
  // (bip322 crate verify.rs:163-173).
  const scriptCode = payments.p2pkh({ hash: p2wpkh.hash }).output;
  if (!scriptCode) {
    throw new Error("signBip322P2wpkhWitness: could not build scriptCode");
  }
  const sighash = toSign.hashForWitnessV0(
    0,
    scriptCode,
    ZERO_SATS,
    SIGHASH_ALL,
  );

  let encodedSignature: Buffer | undefined;
  for (let attempt = 0; attempt < MAX_SIGN_GRIND_ATTEMPTS; attempt++) {
    const entropy = Buffer.alloc(GRIND_ENTROPY_BYTES, 0);
    entropy.writeUInt32LE(attempt, GRIND_COUNTER_OFFSET);
    // ecc.sign emits low-S (libsecp256k1), so 73-byte encodings can't occur.
    const candidate = bscript.signature.encode(
      Buffer.from(ecc.sign(sighash, privateKey, entropy)),
      SIGHASH_ALL,
    );
    if (candidate.length >= MIN_ENCODED_SIG_BYTES) {
      encodedSignature = candidate;
      break;
    }
  }
  if (!encodedSignature) {
    throw new Error(
      "signBip322P2wpkhWitness: could not grind a 71/72-byte signature",
    );
  }

  return Uint8Array.from([
    P2WPKH_WITNESS_ITEMS,
    encodedSignature.length,
    ...encodedSignature,
    pubkey.length,
    ...pubkey,
  ]);
}
