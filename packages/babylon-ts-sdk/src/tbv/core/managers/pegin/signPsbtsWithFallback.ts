/**
 * Batch-sign helper that prefers native `signPsbts` and falls back to
 * sequential `signPsbt` for wallets that don't implement batch signing.
 *
 * @module managers/pegin/signPsbtsWithFallback
 */

import type {
  BitcoinWallet,
  SignPsbtOptions,
} from "../../../../shared/wallets";

/**
 * Sign multiple PSBTs against a wallet. Wallets exposing native batch
 * signing (e.g. UniSat) sign all PSBTs in a single interaction; others
 * (Ledger, AppKit) loop `signPsbt` internally, so the popup UX depends
 * on the wallet adapter.
 *
 * @throws If `signPsbts` returns a different number of signed PSBTs
 *         than were submitted.
 */
export async function signPsbtsWithFallback(
  wallet: BitcoinWallet,
  psbtsHexes: string[],
  options: SignPsbtOptions[],
): Promise<string[]> {
  if (typeof wallet.signPsbts === "function") {
    const signedPsbts = await wallet.signPsbts(psbtsHexes, options);
    if (signedPsbts.length !== psbtsHexes.length) {
      throw new Error(
        `Expected ${psbtsHexes.length} signed PSBTs but received ${signedPsbts.length}`,
      );
    }
    return signedPsbts;
  }

  const signedPsbts: string[] = [];
  for (let i = 0; i < psbtsHexes.length; i++) {
    const signed = await wallet.signPsbt(psbtsHexes[i], options[i]);
    signedPsbts.push(signed);
  }
  return signedPsbts;
}
