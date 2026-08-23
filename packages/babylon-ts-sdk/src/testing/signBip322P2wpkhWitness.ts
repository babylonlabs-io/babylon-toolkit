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
 * `verify.rs:141-153`); a short-DER signature (~0.8% of draws) is ground
 * away by re-signing with fresh entropy. 100 attempts bounds the failure
 * probability around 0.008^100.
 */
const MIN_ENCODED_SIG_BYTES = 71;
const MAX_SIGN_GRIND_ATTEMPTS = 100;

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

  // to_spend / to_sign per bip322 crate util.rs:18-85 (version 0,
  // locktime 0, sequence 0, all values 0, OP_RETURN spend output).
  const toSpend = new Transaction();
  toSpend.version = 0;
  toSpend.locktime = 0;
  toSpend.addInput(
    Buffer.alloc(32, 0),
    0xffffffff,
    0,
    Buffer.concat([Buffer.from([0x00, 0x20]), Buffer.from(messageHash)]),
  );
  toSpend.addOutput(p2wpkh.output, ZERO_SATS);
  const toSign = new Transaction();
  toSign.version = 0;
  toSign.locktime = 0;
  toSign.addInput(toSpend.getHash(), 0, 0);
  toSign.addOutput(Buffer.from([0x6a]), ZERO_SATS); // OP_RETURN

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
    const entropy = Buffer.alloc(32, 0);
    entropy.writeUInt32LE(attempt, 0);
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
    2, // witness item count
    encodedSignature.length,
    ...encodedSignature,
    pubkey.length,
    ...pubkey,
  ]);
}
