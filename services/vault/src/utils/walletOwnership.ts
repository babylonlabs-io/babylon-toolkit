/**
 * Wallet ownership utilities
 *
 * Functions for checking if a vault belongs to the currently connected wallet.
 */

/** Warning message for wallet ownership mismatch */
export const WALLET_OWNERSHIP_WARNING =
  "This vault belongs to a different wallet. Connect the wallet that created this vault to perform actions.";

/**
 * Check if a vault is owned by the connected wallet
 *
 * Compares the vault's depositor BTC public key with the connected wallet's public key.
 * Both keys are normalized (lowercase, without 0x prefix) before comparison.
 *
 * @param vaultDepositorBtcPubkey - The vault's depositor BTC public key
 * @param connectedBtcPubkey - The currently connected wallet's BTC public key
 * @returns true if owned or ownership can't be determined, false only if keys don't match
 */
export function isVaultOwnedByWallet(
  vaultDepositorBtcPubkey: string | undefined,
  connectedBtcPubkey: string | undefined,
): boolean {
  // If we can't determine ownership (missing keys), assume owned to avoid false positives
  if (!vaultDepositorBtcPubkey || !connectedBtcPubkey) {
    return true;
  }

  const normalize = (key: string) => key.replace(/^0x/, "").toLowerCase();
  return normalize(vaultDepositorBtcPubkey) === normalize(connectedBtcPubkey);
}
