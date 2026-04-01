import type { SignPsbtOptions } from "../../../shared/wallets/interfaces";

/**
 * Create SignPsbtOptions for Taproot script-path PSBT signing.
 *
 * All vault protocol signing operations are Taproot script-path spends that
 * require `disableTweakSigner: true` (untweaked key) and `autoFinalized: false`
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
      disableTweakSigner: true,
    })),
  };
}
