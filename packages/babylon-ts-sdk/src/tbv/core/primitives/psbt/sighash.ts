/**
 * Taproot Sighash Computation & Verification
 *
 * Computes BIP-341 taproot script-path sighashes from constructed PSBTs
 * and verifies them against VP-provided expected sighashes. This catches
 * PSBT construction bugs (wrong tap leaf script or incorrect prevout data)
 * BEFORE the user signs, rather than after submission to the VP when it's
 * too late.
 *
 * Note: This does NOT validate control blocks. Control block correctness is
 * enforced by Bitcoin consensus at spend time, not by the sighash.
 *
 * @module primitives/psbt/sighash
 * @see BIP-341 https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki
 */

import { Psbt, Transaction } from "bitcoinjs-lib";
import { tapleafHash } from "bitcoinjs-lib/src/payments/bip341";

import { uint8ArrayToHex } from "../utils/bitcoin";

/** BIP-341 SIGHASH_DEFAULT for taproot script-path spends */
const SIGHASH_DEFAULT = 0x00;

/**
 * Error thrown when a computed sighash does not match the VP-provided expected sighash.
 * Indicates a PSBT construction bug or inconsistent data from the VP.
 */
export class SighashMismatchError extends Error {
  constructor(
    public readonly context: string,
    public readonly expected: string,
    public readonly computed: string,
  ) {
    super(
      `Sighash mismatch for ${context}: ` +
        `expected ${expected}, computed ${computed}. ` +
        `The PSBT may have been constructed with an incorrect tap leaf script or prevout data.`,
    );
    this.name = "SighashMismatchError";
  }
}

/**
 * Compute the BIP-341 taproot script-path sighash for a PSBT input.
 *
 * Extracts the unsigned transaction, prevout data, and tap leaf script
 * from the PSBT, then computes the sighash using bitcoinjs-lib's
 * `hashForWitnessV1`.
 *
 * @param psbtHex - Built (unsigned) PSBT hex
 * @param inputIndex - Index of the input to compute sighash for
 * @returns Sighash as hex string (64 chars, 32 bytes)
 * @throws If input is missing tapLeafScript or witnessUtxo
 */
export function computeTaprootSighash(
  psbtHex: string,
  inputIndex: number,
): string {
  const psbt = Psbt.fromHex(psbtHex);
  const inputs = psbt.data.inputs;

  if (!Number.isInteger(inputIndex) || inputIndex < 0 || inputIndex >= inputs.length) {
    throw new Error(
      `Input index ${inputIndex} out of range (${inputs.length} inputs)`,
    );
  }

  const input = inputs[inputIndex];

  // Require tapLeafScript for script-path sighash computation
  if (!input.tapLeafScript || input.tapLeafScript.length === 0) {
    throw new Error(
      `Input ${inputIndex} is missing tapLeafScript — cannot compute script-path sighash`,
    );
  }

  // Require exactly one tapLeafScript — multiple leaves would be ambiguous
  if (input.tapLeafScript.length !== 1) {
    throw new Error(
      `Input ${inputIndex} has ${input.tapLeafScript.length} tapLeafScript entries; expected exactly 1`,
    );
  }

  // Compute the leaf hash from the tap leaf script
  const tapLeaf = input.tapLeafScript[0];
  const leafHash = tapleafHash({
    output: tapLeaf.script,
    version: tapLeaf.leafVersion,
  });

  // Collect ALL inputs' witnessUtxo data (BIP-341 sighash commits to all prevouts)
  // witnessUtxo.script is Buffer (from bitcoinjs-lib), matching hashForWitnessV1's signature
  const prevOutScripts: Uint8Array[] = [];
  const values: number[] = [];

  for (let i = 0; i < inputs.length; i++) {
    const witnessUtxo = inputs[i].witnessUtxo;
    if (!witnessUtxo) {
      throw new Error(
        `Input ${i} is missing witnessUtxo — required for BIP-341 sighash computation`,
      );
    }
    prevOutScripts.push(witnessUtxo.script);
    values.push(witnessUtxo.value);
  }

  // Extract the unsigned transaction via the stable bip174 public API
  // unsignedTx.toBuffer() returns the raw serialized transaction
  const unsignedTx = psbt.data.globalMap.unsignedTx as
    | { toBuffer(): Uint8Array }
    | undefined;
  if (!unsignedTx) {
    throw new Error(
      "Unable to access unsigned transaction from PSBT",
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx = Transaction.fromBuffer(unsignedTx.toBuffer() as any);

  const sighash = tx.hashForWitnessV1(
    inputIndex,
    prevOutScripts,
    values,
    SIGHASH_DEFAULT,
    leafHash,
  );

  return uint8ArrayToHex(new Uint8Array(sighash));
}

/**
 * Verify that a locally-computed taproot sighash matches the VP-provided expected sighash.
 *
 * Should be called after PSBT construction and before wallet signing to catch
 * construction bugs or inconsistent VP data early.
 *
 * @param psbtHex - Built (unsigned) PSBT hex
 * @param inputIndex - Input index to verify
 * @param expectedSighash - VP-provided expected sighash (hex, with or without 0x prefix)
 * @param context - Human-readable context for error messages (e.g., "Payout input 0")
 * @throws {SighashMismatchError} if computed sighash does not match expected
 */
export function verifySighash(
  psbtHex: string,
  inputIndex: number,
  expectedSighash: string,
  context: string,
): void {
  const computed = computeTaprootSighash(psbtHex, inputIndex);
  // Normalize: strip 0x/0X prefix, lowercase for case-insensitive comparison
  const stripped = expectedSighash.replace(/^0x/i, "");
  const expected = stripped.toLowerCase();

  if (computed !== expected) {
    throw new SighashMismatchError(context, expected, computed);
  }
}
