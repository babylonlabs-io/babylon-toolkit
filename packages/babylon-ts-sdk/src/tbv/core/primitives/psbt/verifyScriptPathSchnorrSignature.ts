/**
 * Independent BIP-340 verification of a wallet-returned Taproot script-path
 * Schnorr signature against an independently-recomputed sighash.
 *
 * Critical Path #7 (CLAUDE.md): the SDK requests script-path signatures with
 * `useTweakedSigner: false, autoFinalized: false`. Wallet support for the
 * untweaked-key flag is inconsistent — older OKX / mobile bridges silently sign
 * with the *tweaked* key, Keystone ignores the flag — and a compromised
 * extension can stuff a 64-byte stub into `tapScriptSig`. A bad signature that
 * the SDK forwards is only caught on broadcast; in the worst case it passes the
 * VP off-chain but Bitcoin rejects it, leaving the depositor's BTC locked in the
 * HTLC until `timelockRefund` matures. This guard rejects such signatures before
 * they are trusted.
 *
 * Why verify against the *locally-built* PSBT, not the wallet-returned one:
 * `assertPsbtUnsignedTxMatches` pins the unsigned transaction but deliberately
 * skips per-input metadata (`witnessUtxo`, `tapLeafScript`). A malicious wallet
 * could rewrite those consistently in the returned PSBT so a wrong-message
 * signature self-validates. The trusted prevout scripts/values and leaf script
 * therefore come from the PSBT we built ourselves (derived from on-chain / WASM
 * sources); only the 64-byte signature comes from the wallet.
 *
 * Reuses the exact primitives `bip322Verify.ts` already depends on — no new
 * dependency:
 *   - `@bitcoin-js/tiny-secp256k1-asmjs` → `verifySchnorr`
 *   - `bitcoinjs-lib` → `Transaction.hashForWitnessV1`
 *   - `@noble/hashes/sha2` → BIP-340 tagged hash for the TapLeaf hash
 *
 * @module tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { Psbt, Transaction } from "bitcoinjs-lib";

import { sha256 } from "@noble/hashes/sha2.js";
import { Buffer } from "buffer";

import {
  SCHNORR_SIG_HEX_LEN,
  TAPSCRIPT_LEAF_VERSION,
  X_ONLY_PUBKEY_HEX_LEN,
  hexToUint8Array,
  stripHexPrefix,
} from "../utils/bitcoin";

/** BIP-341 tag for the TapLeaf hash. */
const TAPLEAF_TAG = "TapLeaf";

/**
 * BIP-340 tagged hash: `SHA256( SHA256(tag) || SHA256(tag) || data )`.
 */
function taggedHash(tag: string, data: Uint8Array): Uint8Array {
  const tagHash = sha256(new TextEncoder().encode(tag));
  const preimage = new Uint8Array(tagHash.length * 2 + data.length);
  preimage.set(tagHash, 0);
  preimage.set(tagHash, tagHash.length);
  preimage.set(data, tagHash.length * 2);
  return sha256(preimage);
}

/**
 * Encode a length as a Bitcoin CompactSize (varint). Tapscript leaf scripts can
 * exceed 252 bytes (WOTS scripts), so the multi-byte forms are required, not
 * just the single-byte fast path.
 */
function encodeCompactSize(n: number): Buffer {
  if (n < 0xfd) {
    return Buffer.from([n]);
  }
  if (n <= 0xffff) {
    const buf = Buffer.allocUnsafe(3);
    buf.writeUInt8(0xfd, 0);
    buf.writeUInt16LE(n, 1);
    return buf;
  }
  if (n <= 0xffffffff) {
    const buf = Buffer.allocUnsafe(5);
    buf.writeUInt8(0xfe, 0);
    buf.writeUInt32LE(n, 1);
    return buf;
  }
  throw new Error(`Script too large to encode as CompactSize: ${n} bytes`);
}

/**
 * Compute the BIP-341 TapLeaf hash for a tapscript leaf:
 * `tagged_hash("TapLeaf", leaf_version || compact_size(script) || script)`.
 */
function computeTapLeafHash(
  leafVersion: number,
  script: Uint8Array,
): Uint8Array {
  const preimage = Buffer.concat([
    Buffer.from([leafVersion]),
    encodeCompactSize(script.length),
    Buffer.from(script),
  ]);
  return taggedHash(TAPLEAF_TAG, preimage);
}

export interface VerifyScriptPathSchnorrSignatureParams {
  /**
   * Hex of the PSBT we built locally and sent to the wallet (the trusted
   * source of prevout scripts/values and the leaf script). NOT the
   * wallet-returned PSBT.
   */
  requestedPsbtHex: string;
  /** The 64-byte Schnorr signature extracted from the wallet's response (128 hex chars). */
  signatureHex: string;
  /** X-only public key (64 hex chars) the wallet signed the script-path leaf with. */
  signerXOnlyPubkeyHex: string;
  /** Index of the input the signature is for. */
  inputIndex: number;
}

/**
 * Assert that `signatureHex` is a valid BIP-340 Schnorr signature by the
 * `signerXOnlyPubkeyHex` key over the Taproot script-path sighash of
 * `requestedPsbtHex` input `inputIndex` (SIGHASH_DEFAULT).
 *
 * @throws If the requested PSBT is malformed, lacks the prevout/leaf data needed
 *         to recompute the sighash, or the signature does not verify.
 */
export function assertScriptPathSchnorrSignature(
  params: VerifyScriptPathSchnorrSignatureParams,
): void {
  const { requestedPsbtHex, signatureHex, signerXOnlyPubkeyHex, inputIndex } =
    params;

  const signatureRaw = stripHexPrefix(signatureHex);
  if (signatureRaw.length !== SCHNORR_SIG_HEX_LEN) {
    throw new Error(
      `Schnorr signature for input ${inputIndex} must be ${SCHNORR_SIG_HEX_LEN} hex chars ` +
        `(64 bytes), got ${signatureRaw.length}.`,
    );
  }

  const signerXOnly = stripHexPrefix(signerXOnlyPubkeyHex);
  if (signerXOnly.length !== X_ONLY_PUBKEY_HEX_LEN) {
    throw new Error(
      `Signer x-only pubkey for input ${inputIndex} must be ${X_ONLY_PUBKEY_HEX_LEN} hex chars ` +
        `(32 bytes), got ${signerXOnly.length}.`,
    );
  }

  const psbt = Psbt.fromHex(requestedPsbtHex);

  if (inputIndex < 0 || inputIndex >= psbt.data.inputs.length) {
    throw new Error(
      `Input index ${inputIndex} out of range (${psbt.data.inputs.length} inputs).`,
    );
  }

  // Taproot's sighash commits to every input's prevout (script + value), so all
  // inputs must carry a witnessUtxo. A missing one is a build error, not a
  // value we can default — fail loudly.
  const prevOutScripts: Buffer[] = [];
  const values: number[] = [];
  for (let i = 0; i < psbt.data.inputs.length; i++) {
    const witnessUtxo = psbt.data.inputs[i].witnessUtxo;
    if (!witnessUtxo) {
      throw new Error(
        `Cannot verify signature: input ${i} of the requested PSBT has no witnessUtxo ` +
          `(required to recompute the Taproot sighash).`,
      );
    }
    prevOutScripts.push(witnessUtxo.script);
    values.push(witnessUtxo.value);
  }

  // The signed input must expose exactly one tapLeafScript — the leaf the
  // depositor signs. Zero means we sent the wrong PSBT; more than one means an
  // ambiguous spend path we never construct for a single-signature input.
  const tapLeafScripts = psbt.data.inputs[inputIndex].tapLeafScript;
  if (!tapLeafScripts || tapLeafScripts.length !== 1) {
    throw new Error(
      `Cannot verify signature: input ${inputIndex} of the requested PSBT must have exactly ` +
        `one tapLeafScript, got ${tapLeafScripts?.length ?? 0}.`,
    );
  }
  const leaf = tapLeafScripts[0];
  if (leaf.leafVersion !== TAPSCRIPT_LEAF_VERSION) {
    throw new Error(
      `Cannot verify signature: input ${inputIndex} tapLeafScript has leaf version ` +
        `0x${leaf.leafVersion.toString(16)}, expected 0x${TAPSCRIPT_LEAF_VERSION.toString(16)}.`,
    );
  }

  const leafHash = computeTapLeafHash(leaf.leafVersion, leaf.script);

  // Reconstruct the unsigned transaction from the requested PSBT using only
  // public bitcoinjs-lib API (same pattern as bip322Verify.ts), then compute the
  // BIP-341 script-path sighash with SIGHASH_DEFAULT.
  const tx = new Transaction();
  tx.version = psbt.version;
  tx.locktime = psbt.locktime;
  for (const input of psbt.txInputs) {
    tx.addInput(input.hash, input.index, input.sequence);
  }
  for (const output of psbt.txOutputs) {
    tx.addOutput(output.script, output.value);
  }

  const sighash = tx.hashForWitnessV1(
    inputIndex,
    prevOutScripts,
    values,
    Transaction.SIGHASH_DEFAULT,
    Buffer.from(leafHash),
  );

  const isValid = ecc.verifySchnorr(
    sighash,
    hexToUint8Array(signerXOnly),
    hexToUint8Array(signatureRaw),
  );

  if (!isValid) {
    throw new Error(
      `Schnorr signature for input ${inputIndex} (signer ${signerXOnly}) does not verify ` +
        `against the expected Taproot script-path sighash. The wallet may have signed with ` +
        `the tweaked key, signed a different transaction, or returned an invalid signature.`,
    );
  }
}
