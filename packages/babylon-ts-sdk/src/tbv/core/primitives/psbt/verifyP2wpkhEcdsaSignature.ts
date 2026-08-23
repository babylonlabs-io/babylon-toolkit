/**
 * Far-side verification of P2WPKH ECDSA signatures a wallet returned, over
 * the PSBT we requested (trusted prevouts) — the Native SegWit sibling of
 * `verifyKeyPathSchnorrSignature`. Reference: btc-vault
 * `crates/btc-wallet-remote/src/client.rs:945-1000
 * verify_finalized_p2wpkh_spend`. The wallet's success/finalization is
 * never trusted on its own (CLAUDE.md §8): prevout script and value come
 * from the PSBT we built; only the signature bytes come from the wallet.
 *
 * @module tbv/core/primitives/psbt/verifyP2wpkhEcdsaSignature
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import {
  crypto as bcrypto,
  script as bscript,
  payments,
  Psbt,
  Transaction,
} from "bitcoinjs-lib";

import { Buffer } from "buffer";

import { decodeWitnessStack } from "../../utils/witness/witnessStack";

// P2WPKH scriptPubKey is exactly `OP_0 OP_PUSHBYTES_20 <20-byte key hash>`
// (BIP-141 witness program v0, 20 bytes).
const P2WPKH_SCRIPT_LEN = 22;
const OP_0 = 0x00;
const OP_PUSHBYTES_20 = 0x14;
const P2WPKH_PROGRAM_START = 2;

/** SEC1 compressed pubkey (client.rs:959: "expected a 33-byte compressed key"). */
const COMPRESSED_PUBKEY_BYTES = 33;
/** Consensus P2WPKH witness: exactly [signature, pubkey] (client.rs:951-957). */
const P2WPKH_WITNESS_ITEMS = 2;

/** Only claim P2WPKH: 22-byte scriptPubKey starting `OP_0 PUSH20`. */
export function isP2wpkhScript(
  script: Uint8Array | undefined,
): script is Uint8Array {
  return (
    script !== undefined &&
    script.length === P2WPKH_SCRIPT_LEN &&
    script[0] === OP_0 &&
    script[1] === OP_PUSHBYTES_20
  );
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

/** The `[signature, pubkey]` pair of a finalized P2WPKH witness (client.rs:951-957). */
function decodeP2wpkhWitness(
  finalScriptWitness: Uint8Array,
  inputIndex: number,
): { signature: Uint8Array; pubkey: Uint8Array } {
  const items = decodeWitnessStack(finalScriptWitness, "finalScriptWitness");
  if (items.length !== P2WPKH_WITNESS_ITEMS) {
    throw new Error(
      `Returned PSBT input ${inputIndex}: a finalized P2WPKH witness must have ` +
        `exactly 2 items [signature, pubkey], got ${items.length}.`,
    );
  }
  return { signature: items[0], pubkey: items[1] };
}

export interface AssertReturnedP2wpkhSignatureParams {
  /** Hex of the PSBT we built and sent (trusted prevout script/value). NOT the wallet's. */
  requestedPsbtHex: string;
  /** The wallet-returned PSBT input carrying the signature material. */
  returnedInput: {
    partialSig?: Array<{ pubkey: Uint8Array; signature: Uint8Array }>;
    finalScriptWitness?: Uint8Array;
  };
  /** Index of the input the signature is for. */
  inputIndex: number;
}

/**
 * Assert that the returned input carries a valid P2WPKH ECDSA signature
 * over the BIP-143 sighash of `requestedPsbtHex` input `inputIndex`:
 * `partialSig` (BIP-174: the value is the exact witness-stack signature
 * bytes, the key its pubkey), or the finalized 2-item witness — and when
 * both are present they must be the same bytes.
 *
 * @throws If the requested input is not a P2WPKH spend, no signature was
 *         returned, a finalized witness disagrees with its `partialSig`,
 *         or any check of `verify_finalized_p2wpkh_spend` fails.
 */
export function assertReturnedP2wpkhSignature(
  params: AssertReturnedP2wpkhSignatureParams,
): void {
  const { requestedPsbtHex, returnedInput, inputIndex } = params;

  const partials = returnedInput.partialSig;
  // Consensus allows exactly one signature in a P2WPKH witness, so a second
  // partialSig entry is ambiguous tampering, not a fallback to pick from.
  if (partials !== undefined && partials.length > 1) {
    throw new Error(
      `Returned PSBT input ${inputIndex}: a P2WPKH input must carry at most one ` +
        `partial signature, got ${partials.length}.`,
    );
  }
  const partial = partials?.[0];
  const witness = returnedInput.finalScriptWitness
    ? decodeP2wpkhWitness(returnedInput.finalScriptWitness, inputIndex)
    : undefined;

  // Both fields can be present, and the consumers broadcast the WITNESS
  // bytes — so the two must agree, not just one of them verify (same
  // rationale as the tapKeySig/witness agreement check).
  if (
    partial &&
    witness &&
    (!bytesEqual(partial.signature, witness.signature) ||
      !bytesEqual(partial.pubkey, witness.pubkey))
  ) {
    throw new Error(
      `Returned PSBT input ${inputIndex} finalized witness does not match its partialSig.`,
    );
  }

  const material = partial ?? witness;
  if (!material) {
    throw new Error(
      `Returned PSBT input ${inputIndex} carries no P2WPKH signature ` +
        `(no partialSig, not finalized).`,
    );
  }

  assertP2wpkhEcdsaSignature(
    requestedPsbtHex,
    material.signature,
    material.pubkey,
    inputIndex,
  );
}

/**
 * The crypto core, mirroring `verify_finalized_p2wpkh_spend` check by
 * check: pubkey shape and curve membership, hash160(pubkey) == witness
 * program, strict-DER + SIGHASH_ALL-only signature, ECDSA over the
 * BIP-143 sighash recomputed from the REQUESTED prevout.
 */
function assertP2wpkhEcdsaSignature(
  requestedPsbtHex: string,
  encodedSignature: Uint8Array,
  pubkey: Uint8Array,
  inputIndex: number,
): void {
  const psbt = Psbt.fromHex(requestedPsbtHex);

  if (inputIndex < 0 || inputIndex >= psbt.data.inputs.length) {
    throw new Error(
      `Input index ${inputIndex} out of range (${psbt.data.inputs.length} inputs).`,
    );
  }
  const prevout = psbt.data.inputs[inputIndex].witnessUtxo;
  if (!prevout || !isP2wpkhScript(prevout.script)) {
    throw new Error(
      `Input ${inputIndex} of the requested PSBT is not a P2WPKH input.`,
    );
  }

  // Pubkey: exactly 33 bytes (client.rs:959-965) and a parseable curve
  // point, as PublicKey::from_slice (client.rs:966-968).
  if (pubkey.length !== COMPRESSED_PUBKEY_BYTES) {
    throw new Error(
      `Returned PSBT input ${inputIndex}: P2WPKH pubkey must be 33 bytes, ` +
        `got ${pubkey.length}.`,
    );
  }
  if (!ecc.isPointCompressed(pubkey)) {
    throw new Error(
      `Returned PSBT input ${inputIndex}: P2WPKH pubkey is not a valid secp256k1 point.`,
    );
  }

  // hash160(pubkey) must equal the prevout's witness program — what
  // consensus checks (client.rs:970-977).
  const program = prevout.script.subarray(
    P2WPKH_PROGRAM_START,
    P2WPKH_SCRIPT_LEN,
  );
  if (!bytesEqual(bcrypto.hash160(Buffer.from(pubkey)), program)) {
    throw new Error(
      `Returned PSBT input ${inputIndex}: P2WPKH pubkey does not hash to the ` +
        `prevout's witness program.`,
    );
  }

  // Strict-DER decode with defined-hashtype gate — the accept set of
  // ecdsa::Signature::from_slice / EcdsaSighashType::from_standard
  // (client.rs:978-980) — then SIGHASH_ALL exactly (client.rs:981-987).
  let decoded: { signature: Buffer; hashType: number };
  try {
    decoded = bscript.signature.decode(Buffer.from(encodedSignature));
  } catch (e) {
    throw new Error(
      `Returned PSBT input ${inputIndex}: P2WPKH signature is not DER with a ` +
        `defined sighash byte: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (decoded.hashType !== Transaction.SIGHASH_ALL) {
    throw new Error(
      `Returned PSBT input ${inputIndex}: P2WPKH signature has sighash type ` +
        `0x${decoded.hashType.toString(16)} (expected SIGHASH_ALL).`,
    );
  }

  // BIP-143 sighash over the REQUESTED prevout value with the standard
  // P2WPKH scriptCode built from the witness program (client.rs:988-991;
  // scriptCode template per bitcoinjs-lib's own P2WPKH signer,
  // `src/psbt.js:1245-1255`).
  const scriptCode = payments.p2pkh({ hash: Buffer.from(program) }).output;
  if (!scriptCode) {
    throw new Error(
      `Returned PSBT input ${inputIndex}: could not build the P2WPKH scriptCode.`,
    );
  }
  const tx = Transaction.fromBuffer(psbt.data.globalMap.unsignedTx.toBuffer());
  const sighash = tx.hashForWitnessV0(
    inputIndex,
    scriptCode,
    prevout.value,
    decoded.hashType,
  );

  // strict=true rejects high-S, as libsecp256k1's verify_ecdsa does
  // (client.rs:992-999; secp256k1 crate `ecdsa/mod.rs:194`). ecc.verify
  // throws on out-of-range r/s — that is a failed verification here.
  let verifies = false;
  try {
    verifies = ecc.verify(sighash, pubkey, decoded.signature, true);
  } catch {
    verifies = false;
  }
  if (!verifies) {
    throw new Error(
      `P2WPKH signature for input ${inputIndex} does not verify against the ` +
        `requested PSBT's prevout. The wallet may have signed a different ` +
        `transaction or key.`,
    );
  }
}
