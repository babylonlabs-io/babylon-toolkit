import type { SignPsbtOptions } from "../../../shared/wallets/interfaces";

/**
 * Create SignPsbtOptions for Taproot script-path PSBT signing.
 *
 * All vault protocol signing operations are Taproot script-path spends that
 * require `useTweakedSigner: false` (untweaked key) and `autoFinalized: false`
 * (to preserve tapScriptSig for Schnorr signature extraction).
 *
 * @param publicKey - Signer's BTC public key (hex). Accepts both compressed
 *   (66-char) and x-only (64-char) formats — the wallet connector handles both.
 * @param inputCount - Number of inputs to sign. Generates entries
 *   for indices 0 through inputCount-1.
 */
export function createTaprootScriptPathSignOptions(
  publicKey: string,
  inputCount: number,
): SignPsbtOptions {
  if (!Number.isInteger(inputCount) || inputCount < 1) {
    throw new Error(`inputCount must be a positive integer, got ${inputCount}`);
  }

  return {
    autoFinalized: false,
    signInputs: Array.from({ length: inputCount }, (_, i) => ({
      index: i,
      publicKey,
      useTweakedSigner: false,
    })),
  };
}

/**
 * Create SignPsbtOptions for a Taproot script-path PSBT whose signing input
 * is not input 0 — the delegated-claim Payout, where input 0 is the PegIn
 * UTXO and the claimer signs the Assert connector at input 1.
 *
 * Same flags and the same caveat as
 * {@link createTaprootScriptPathSignOptions}: the produced signature must be
 * validated before the PSBT is treated as signed.
 *
 * @param publicKey - Signer's BTC public key (hex), compressed or x-only.
 * @param inputIndex - Index of the single input to sign.
 */
export function createTaprootScriptPathSignOptionsForInput(
  publicKey: string,
  inputIndex: number,
): SignPsbtOptions {
  if (!Number.isInteger(inputIndex) || inputIndex < 0) {
    throw new Error(
      `inputIndex must be a non-negative integer, got ${inputIndex}`,
    );
  }

  return {
    autoFinalized: false,
    signInputs: [{ index: inputIndex, publicKey, useTweakedSigner: false }],
  };
}
