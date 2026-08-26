/**
 * Decoded BTC payout addresses for the withdraw flow.
 *
 * Each vault carries an on-chain registered payout scriptPubKey
 * (`depositorPayoutBtcAddress` — 0x-prefixed hex). When a withdrawal is
 * initiated the BTC will be sent to the address encoded by that scriptPubKey,
 * which can differ from the user's currently connected wallet if they switched
 * wallets after depositing.
 */

import { logger } from "@/infrastructure";
import type { CollateralVaultEntry } from "@/types/collateral";
import { scriptPubKeyHexToBtcAddress } from "@/utils/btc";

/**
 * Decode each vault's registered payout scriptPubKey to a BTC address and
 * dedupe (preserving first-seen order).
 *
 * A vault that can't be decoded is logged and skipped — the on-chain
 * transaction is unaffected, but the user will see fewer addresses than vaults.
 * Throwing instead would block the entire withdraw modal on a single bad
 * indexer record.
 */
export function getUniquePayoutAddresses(
  vaults: readonly CollateralVaultEntry[],
): string[] {
  const seen = new Set<string>();
  const addresses: string[] = [];
  for (const vault of vaults) {
    if (!vault.depositorPayoutBtcAddress) continue;
    try {
      const address = scriptPubKeyHexToBtcAddress(
        vault.depositorPayoutBtcAddress,
      );
      if (!seen.has(address)) {
        seen.add(address);
        addresses.push(address);
      }
    } catch (error) {
      logger.error(error instanceof Error ? error : new Error(String(error)), {
        data: {
          context: "Decode payout scriptPubKey for withdraw display",
          vaultId: vault.vaultId,
        },
      });
    }
  }
  return addresses;
}
