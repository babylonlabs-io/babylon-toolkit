/**
 * Vault warnings and ownership utilities
 *
 * Warning messages and functions for vault action validation.
 */

import { COPY } from "../copy";

const BTC_PUBKEY_TRUNCATE_LEN = 4;

/**
 * Truncate an x-only BTC pubkey for display. Strips any `0x` prefix the
 * storage layer may attach so the user sees a BTC-native rendering
 * (`bcc5...f21c`) rather than an ETH-styled one.
 */
function truncateBtcPubkey(pubkey: string): string {
  const bare = pubkey.replace(/^0x/i, "");
  return `${bare.slice(0, BTC_PUBKEY_TRUNCATE_LEN)}...${bare.slice(-BTC_PUBKEY_TRUNCATE_LEN)}`;
}

/**
 * Build the wallet ownership-mismatch warning for a vault. Names the expected
 * wallet by its truncated BTC pubkey so the user can identify which wallet to
 * switch to. `isVaultOwnedByWallet` guarantees this is only ever called when
 * the vault has a known depositor pubkey (and that it differs from the
 * connected one), so a generic-without-pubkey branch would be dead code.
 */
export function getWalletOwnershipWarning(
  vaultDepositorBtcPubkey: string,
): string {
  return COPY.pegin.warnings.walletOwnershipMismatch(
    truncateBtcPubkey(vaultDepositorBtcPubkey),
  );
}

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

  const normalize = (key: string) => key.replace(/^0x/i, "").toLowerCase();
  return normalize(vaultDepositorBtcPubkey) === normalize(connectedBtcPubkey);
}
