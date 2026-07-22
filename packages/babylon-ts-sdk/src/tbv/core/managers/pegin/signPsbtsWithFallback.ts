/**
 * Wallet-signing helper that routes a lone PSBT to `signPsbt`, prefers native
 * `signPsbts` for real batches, and falls back to sequential `signPsbt` for
 * wallets that don't implement batch signing.
 *
 * @module managers/pegin/signPsbtsWithFallback
 */

import type {
  BitcoinWallet,
  SignPsbtOptions,
} from "../../../../shared/wallets";

/**
 * Sign one or more PSBTs against a wallet.
 *
 * A single PSBT is always signed via `signPsbt`, never the batch endpoint: it's
 * one wallet interaction either way, and `signPsbt` is the universally-required
 * wallet method (batch `signPsbts` is optional), so single-sign is the portable
 * choice — some integrations (notably MPC / institutional wallets) prefer it.
 * For a real batch (>1), wallets exposing native `signPsbts` (e.g. UniSat) sign
 * in one interaction; others loop `signPsbt`.
 *
 * @throws If native `signPsbts` returns a different number of signed PSBTs
 *         than were submitted.
 */
export async function signPsbtsWithFallback(
  wallet: BitcoinWallet,
  psbtsHexes: string[],
  options?: SignPsbtOptions[],
): Promise<string[]> {
  if (psbtsHexes.length === 1) {
    return [await wallet.signPsbt(psbtsHexes[0], options?.[0])];
  }

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
    signedPsbts.push(await wallet.signPsbt(psbtsHexes[i], options?.[i]));
  }
  return signedPsbts;
}
