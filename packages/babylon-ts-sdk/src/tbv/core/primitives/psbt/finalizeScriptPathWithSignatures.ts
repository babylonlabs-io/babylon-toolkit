/**
 * Finalize a Taproot script-path spend from the PSBT *we* built, using only the
 * verified signatures the wallet returned.
 *
 * Why this exists. The obvious shape — hand the wallet's PSBT to
 * `finalizeAllInputs()` — puts wallet-controlled bytes on the trust path even
 * when the signature itself has been verified.
 * `assertPsbtUnsignedTxMatches` deliberately pins only the unsigned
 * transaction and skips per-input metadata, so `tapLeafScript`, `controlBlock`
 * and `tapKeySig` all survive from the wallet's response untouched. And
 * bitcoinjs-lib checks key-spend first (`src/psbt.js`, `_finalizeTaprootInput`:
 * "Check key spend first. Increased privacy and reduced block space."), so a
 * returned `tapKeySig` wins outright and `tapScriptSig` is never consulted.
 * Every output the depositor-claim reserve and the HTLC refund spend from uses
 * a NUMS internal key, so the resulting key-path witness cannot satisfy the
 * script — the transaction is rejected at broadcast, after a wallet prompt the
 * depositor cannot make sense of.
 *
 * Verifying and then discarding the wallet's PSBT closes that off structurally
 * rather than detecting it afterwards, and it makes the code match what
 * `verifyScriptPathSchnorrSignature` already documents: "only the 64-byte
 * signature comes from the wallet".
 *
 * @module tbv/core/primitives/psbt/finalizeScriptPathWithSignatures
 */

import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { X_ONLY_PUBKEY_HEX_LEN } from "../../utils/validation";
import {
  SCHNORR_SIG_HEX_LEN,
  TAPSCRIPT_LEAF_VERSION,
  hexToUint8Array,
  stripHexPrefix,
} from "../utils/bitcoin";
import { computeTapLeafHash } from "../utils/taproot";

export interface FinalizeScriptPathWithSignaturesParams {
  /**
   * Hex of the PSBT built locally and sent to the wallet — the sole source of
   * every per-input field. NOT the wallet-returned PSBT.
   */
  requestedPsbtHex: string;
  /**
   * Verified 64-byte Schnorr signatures, one per input, index-aligned with the
   * PSBT's inputs. Each must already have passed
   * `assertScriptPathSchnorrSignature` — this function does not re-verify them,
   * it only decides which bytes are allowed to reach the witness.
   */
  signaturesHex: readonly string[];
  /** X-only pubkey (64 hex chars) the signatures are attributed to. */
  signerXOnlyPubkeyHex: string;
}

/**
 * Attach `signaturesHex` to the locally built PSBT's script-path inputs,
 * finalize, and return the extracted transaction hex.
 *
 * @throws If the signature count does not match the input count, any signature
 *   or the signer key is malformed, any input does not carry exactly one
 *   tapscript leaf at the expected leaf version, any input already carries a
 *   key-path signature, or bitcoinjs-lib cannot finalize.
 */
export function finalizeScriptPathWithSignatures(
  params: FinalizeScriptPathWithSignaturesParams,
): string {
  const { requestedPsbtHex, signaturesHex, signerXOnlyPubkeyHex } = params;

  const signerXOnly = stripHexPrefix(signerXOnlyPubkeyHex);
  if (signerXOnly.length !== X_ONLY_PUBKEY_HEX_LEN) {
    throw new Error(
      `Signer x-only pubkey must be ${X_ONLY_PUBKEY_HEX_LEN} hex chars ` +
        `(32 bytes), got ${signerXOnly.length}.`,
    );
  }
  const signerPubkey = Buffer.from(hexToUint8Array(signerXOnly));

  const psbt = Psbt.fromHex(requestedPsbtHex);

  if (signaturesHex.length !== psbt.data.inputs.length) {
    throw new Error(
      `Cannot finalize: got ${signaturesHex.length} signature(s) for ` +
        `${psbt.data.inputs.length} input(s). Every input must be signed — ` +
        `refusing to broadcast a partially signed transaction.`,
    );
  }

  psbt.data.inputs.forEach((input, inputIndex) => {
    // Our own builders never produce a key-path signature for these spends.
    // If one is present the PSBT is not the one we built, which would defeat
    // the whole point of finalizing locally.
    if (input.tapKeySig) {
      throw new Error(
        `Cannot finalize: input ${inputIndex} of the locally built PSBT ` +
          `carries a key-path signature. These outputs are script-path only.`,
      );
    }

    const tapLeafScripts = input.tapLeafScript;
    if (!tapLeafScripts || tapLeafScripts.length !== 1) {
      throw new Error(
        `Cannot finalize: input ${inputIndex} must have exactly one ` +
          `tapLeafScript, got ${tapLeafScripts?.length ?? 0}.`,
      );
    }
    const leaf = tapLeafScripts[0];
    if (leaf.leafVersion !== TAPSCRIPT_LEAF_VERSION) {
      throw new Error(
        `Cannot finalize: input ${inputIndex} tapLeafScript has leaf version ` +
          `0x${leaf.leafVersion.toString(16)}, expected ` +
          `0x${TAPSCRIPT_LEAF_VERSION.toString(16)}.`,
      );
    }

    const signatureRaw = stripHexPrefix(signaturesHex[inputIndex]);
    if (signatureRaw.length !== SCHNORR_SIG_HEX_LEN) {
      throw new Error(
        `Signature for input ${inputIndex} must be ${SCHNORR_SIG_HEX_LEN} hex ` +
          `chars (64 bytes), got ${signatureRaw.length}.`,
      );
    }

    psbt.updateInput(inputIndex, {
      tapScriptSig: [
        {
          pubkey: signerPubkey,
          leafHash: computeTapLeafHash(leaf.leafVersion, leaf.script),
          signature: Buffer.from(hexToUint8Array(signatureRaw)),
        },
      ],
    });
  });

  // With no tapKeySig anywhere, bitcoinjs takes the script-path branch for
  // every input and builds `[signature, leafScript, controlBlock]` from the
  // leaf we supplied.
  psbt.finalizeAllInputs();

  return psbt.extractTransaction().toHex();
}
