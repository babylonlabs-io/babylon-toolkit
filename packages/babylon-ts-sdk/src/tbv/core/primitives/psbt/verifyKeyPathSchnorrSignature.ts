/**
 * Far-side verification of Taproot KEY-PATH Schnorr signatures a wallet
 * returned, over the PSBT we requested (trusted prevouts) — the key-path twin
 * of `assertScriptPathSchnorrSignature`. Reference: btc-vault
 * `crates/btc-wallet-remote/src/client.rs check_signatures_valid` (output key taken
 * from the prevout scriptPubKey, all prevouts committed). The wallet's
 * success/finalization is never trusted on its own (CLAUDE.md §8).
 * `assertReturnedKeyPathSignatures` additionally dispatches P2WPKH-funded
 * inputs to `verifyP2wpkhEcdsaSignature` (client.rs's
 * `verify_finalized_p2wpkh_spend` sibling), so a Native SegWit software
 * wallet's signatures no longer pass through unchecked.
 *
 * Why verify against the *requested* PSBT: `assertPsbtUnsignedTxMatches` pins
 * the unsigned transaction but deliberately skips per-input metadata, so a
 * wallet could rewrite `witnessUtxo` in its response and make a wrong-message
 * signature self-validate. Prevout scripts and values therefore come from the
 * PSBT we built; only the signature bytes come from the wallet.
 *
 * @module tbv/core/primitives/psbt/verifyKeyPathSchnorrSignature
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { Psbt, Transaction } from "bitcoinjs-lib";

import { Buffer } from "buffer";

import { decodeWitnessStack } from "../../utils/witness/witnessStack";
import { hexToUint8Array, stripHexPrefix } from "../utils/bitcoin";
import {
  assertReturnedP2wpkhSignature,
  isP2wpkhScript,
} from "./verifyP2wpkhEcdsaSignature";

const SCHNORR_SIG_BYTES = 64;
const SIGHASH_DEFAULT = Transaction.SIGHASH_DEFAULT; // 0x00
const SIGHASH_ALL = Transaction.SIGHASH_ALL; // 0x01

// P2TR scriptPubKey is exactly `OP_1 OP_PUSHBYTES_32 <32-byte output key>`.
const P2TR_SCRIPT_LEN = 34;
const OP_1 = 0x51;
const OP_PUSHBYTES_32 = 0x20;
const P2TR_OUTPUT_KEY_OFFSET = 2;

function isP2trScript(script: Uint8Array | undefined): script is Uint8Array {
  return (
    script !== undefined &&
    script.length === P2TR_SCRIPT_LEN &&
    script[0] === OP_1 &&
    script[1] === OP_PUSHBYTES_32
  );
}

/** BIP-341: 64 bytes ⇒ SIGHASH_DEFAULT; 65 bytes ⇒ the trailing byte is the hash type (we accept ALL only). */
function splitHashType(
  sig: Uint8Array,
  inputIndex: number,
): { signature: Uint8Array; hashType: number } {
  if (sig.length === SCHNORR_SIG_BYTES) {
    return { signature: sig, hashType: SIGHASH_DEFAULT };
  }
  if (
    sig.length === SCHNORR_SIG_BYTES + 1 &&
    sig[SCHNORR_SIG_BYTES] === SIGHASH_ALL
  ) {
    return {
      signature: sig.subarray(0, SCHNORR_SIG_BYTES),
      hashType: SIGHASH_ALL,
    };
  }
  throw new Error(
    `Key-path signature for input ${inputIndex} must be 64 bytes (SIGHASH_DEFAULT) or ` +
      `65 bytes ending in 0x01 (SIGHASH_ALL), got ${sig.length}.`,
  );
}

export interface AssertKeyPathSchnorrSignatureParams {
  /** Hex of the PSBT we built and sent (trusted prevout scripts/values). NOT the wallet's. */
  requestedPsbtHex: string;
  /** 64- or 65-byte signature, hex. */
  signatureHex: string;
  /** Index of the input the signature is for. */
  inputIndex: number;
}

/**
 * Assert that `signatureHex` is a valid BIP-340 Schnorr signature over the
 * Taproot key-path sighash of `requestedPsbtHex` input `inputIndex`, under the
 * tweaked output key taken from that input's prevout scriptPubKey.
 *
 * @throws If the input is not a key-path P2TR spend, the requested PSBT lacks
 *         the prevout data needed to recompute the sighash, or the signature
 *         does not verify.
 */
export function assertKeyPathSchnorrSignature(
  params: AssertKeyPathSchnorrSignatureParams,
): void {
  const { requestedPsbtHex, signatureHex, inputIndex } = params;

  const psbt = Psbt.fromHex(requestedPsbtHex);

  if (inputIndex < 0 || inputIndex >= psbt.data.inputs.length) {
    throw new Error(
      `Input index ${inputIndex} out of range (${psbt.data.inputs.length} inputs).`,
    );
  }

  if (!isKeyPathEligible(psbt.data.inputs[inputIndex])) {
    throw new Error(
      `Input ${inputIndex} of the requested PSBT is not a key-path P2TR input.`,
    );
  }

  // Taproot's sighash commits to every input's prevout (script + value), so all
  // inputs must carry a witnessUtxo. A missing one is a build error, not a
  // value we can default — fail loudly.
  const prevOutScripts: Buffer[] = [];
  const values: number[] = [];
  for (let i = 0; i < psbt.data.inputs.length; i++) {
    const prevout = psbt.data.inputs[i].witnessUtxo;
    if (!prevout) {
      throw new Error(
        `Cannot verify signature: input ${i} of the requested PSBT has no witnessUtxo ` +
          `(required to recompute the Taproot sighash).`,
      );
    }
    prevOutScripts.push(prevout.script);
    values.push(prevout.value);
  }

  const { signature, hashType } = splitHashType(
    hexToUint8Array(stripHexPrefix(signatureHex)),
    inputIndex,
  );

  const tx = Transaction.fromBuffer(psbt.data.globalMap.unsignedTx.toBuffer());
  const sighash = tx.hashForWitnessV1(
    inputIndex,
    prevOutScripts,
    values,
    hashType,
  );

  // Key-path signatures verify against the TWEAKED output key = the prevout's
  // witness program.
  const outputKey = prevOutScripts[inputIndex].subarray(P2TR_OUTPUT_KEY_OFFSET);

  if (!ecc.verifySchnorr(sighash, outputKey, signature)) {
    throw new Error(
      `Key-path Schnorr signature for input ${inputIndex} does not verify against the ` +
        `requested PSBT's prevout (output key ${Buffer.from(outputKey).toString("hex")}). ` +
        `The wallet may have signed a different transaction or key.`,
    );
  }
}

/**
 * A key-path P2TR input: an internal key, no script-path material, and a
 * taproot prevout. Script-path inputs are the script-path verifier's job.
 */
function isKeyPathEligible(input: {
  tapInternalKey?: Uint8Array;
  tapLeafScript?: unknown;
  tapMerkleRoot?: Uint8Array;
  witnessUtxo?: { script: Uint8Array };
}): boolean {
  return (
    input.tapInternalKey !== undefined &&
    input.tapLeafScript === undefined &&
    input.tapMerkleRoot === undefined &&
    isP2trScript(input.witnessUtxo?.script)
  );
}

/**
 * The lone stack item of a finalized key-path witness. An annex would add a
 * second item, but Bitcoin Core rejects annexes as nonstandard
 * (`src/policy/policy.cpp:327-329`), so such a spend could never broadcast.
 */
function singleWitnessItem(
  finalScriptWitness: Uint8Array,
  inputIndex: number,
): Uint8Array {
  const items = decodeWitnessStack(finalScriptWitness, "finalScriptWitness");
  if (items.length !== 1) {
    throw new Error(
      `Returned PSBT input ${inputIndex}: a finalized key-path witness must have ` +
        `exactly one item, got ${items.length}.`,
    );
  }
  return items[0];
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

export interface AssertReturnedKeyPathSignaturesParams {
  /** PSBT we built locally and asked the wallet to sign. */
  requestedPsbtHex: string;
  /** PSBT the wallet returned after signing. */
  returnedPsbtHex: string;
}

/**
 * Verify every key-path-eligible and P2WPKH input of the REQUESTED PSBT
 * against what the wallet RETURNED. Key-path: `tapKeySig`, or the single
 * finalized witness item for wallets that auto-finalize — and when both are
 * present they must be the same bytes. P2WPKH: `partialSig`, or the finalized
 * 2-item witness, verified as ECDSA over the BIP-143 sighash
 * ({@link assertReturnedP2wpkhSignature}); a failure throws but the input is
 * NOT counted. Script-path and unknown script types are skipped (they have
 * their own checks).
 *
 * @returns How many inputs were verified KEY-PATH. A caller that knows every
 *          input is taproot key-path (e.g. an approval wallet) must assert
 *          this equals its input count — P2WPKH inputs never count toward it,
 *          so that gate stays exact.
 * @throws If the input counts differ, an eligible input carries no signature, a
 *         finalized witness disagrees with its `tapKeySig`/`partialSig`, or any
 *         signature does not verify.
 */
export function assertReturnedKeyPathSignatures(
  params: AssertReturnedKeyPathSignaturesParams,
): number {
  const { requestedPsbtHex, returnedPsbtHex } = params;

  const requested = Psbt.fromHex(requestedPsbtHex);
  const returned = Psbt.fromHex(returnedPsbtHex);

  if (returned.data.inputs.length !== requested.data.inputs.length) {
    throw new Error(
      `Returned PSBT input count ${returned.data.inputs.length} differs from the ` +
        `requested ${requested.data.inputs.length}.`,
    );
  }

  let verified = 0;
  requested.data.inputs.forEach((input, inputIndex) => {
    const returnedInput = returned.data.inputs[inputIndex];

    if (!isKeyPathEligible(input)) {
      // Native SegWit funding inputs get the ECDSA check; anything else
      // (script-path, P2WSH, ...) is another verifier's job.
      if (isP2wpkhScript(input.witnessUtxo?.script)) {
        assertReturnedP2wpkhSignature({
          requestedPsbtHex,
          returnedInput,
          inputIndex,
        });
      }
      return;
    }
    verified++;

    const tapKeySig = returnedInput.tapKeySig;
    const witnessSig = returnedInput.finalScriptWitness
      ? singleWitnessItem(returnedInput.finalScriptWitness, inputIndex)
      : undefined;

    // Both fields can be present, and the consumers broadcast the WITNESS
    // bytes — so the two must agree, not just one of them verify. Matches
    // btc-vault `crates/btc-wallet-remote/src/client.rs:1053-1072,1102-1121`,
    // which checks each independently.
    if (tapKeySig && witnessSig && !bytesEqual(tapKeySig, witnessSig)) {
      throw new Error(
        `Returned PSBT input ${inputIndex} finalized witness does not match its tapKeySig.`,
      );
    }

    const sig = tapKeySig ?? witnessSig;
    if (!sig) {
      throw new Error(
        `Returned PSBT input ${inputIndex} carries no key-path signature ` +
          `(no tapKeySig, not finalized).`,
      );
    }

    assertKeyPathSchnorrSignature({
      requestedPsbtHex,
      signatureHex: Buffer.from(sig).toString("hex"),
      inputIndex,
    });
  });

  return verified;
}
