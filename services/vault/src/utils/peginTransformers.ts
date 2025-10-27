/**
 * Data transformation utilities for converting blockchain data to UI formats
 */

import type { Hex } from "viem";

import type { PeginRequest } from "../clients/eth-contract/btc-vaults-manager/query";
import type { VaultActivity } from "../types";

/**
 * Satoshis per Bitcoin constant
 * 1 BTC = 100,000,000 satoshis
 */
export const SATOSHIS_PER_BTC = 100_000_000n;

/**
 * Format BTC amount from satoshis to BTC with proper decimals
 * @param satoshis - Amount in satoshis (smallest Bitcoin unit)
 * @returns Formatted BTC amount as string (e.g., "1.50")
 */
export function formatBTCAmount(satoshis: bigint): string {
  // Convert to BTC by dividing by 100,000,000
  const btc = Number(satoshis) / Number(SATOSHIS_PER_BTC);

  // Format with up to 8 decimal places, removing trailing zeros
  return btc.toFixed(8).replace(/\.?0+$/, "") || "0";
}

/**
 * Transform pegin request from contract to vault activity format
 *
 * Maps contract pegin request data to the UI activity format used in the vault interface.
 * Handles status mapping from contract enum to user-friendly strings.
 *
 * @param peginRequest - Pegin request data from BTCVaultsManager contract
 * @param txHash - Transaction hash (serves as unique ID)
 * @returns Vault activity object for UI display
 */
export function transformPeginToActivity(
  peginRequest: PeginRequest,
  txHash: Hex,
): VaultActivity {
  // Map contract status enum to UI-friendly strings
  // Contract status values:
  // 0 = Pending - Request submitted, waiting for ACKs
  // 1 = Verified - All ACKs collected, ready for inclusion proof
  // 2 = Available - Inclusion proof verified, vBTC minted, ready for positions
  // 3 = InPosition - Vault is being used as collateral
  // 4 = Expired - Pegged-in BTC has been liquidated/repaid
  const statusMap = {
    0: "Pending" as const,
    1: "Pending" as const,
    2: "Available" as const,
    3: "In Use" as const,
    4: "Expired" as const,
  };

  return {
    id: txHash,
    amount: formatBTCAmount(peginRequest.amount),
    status:
      statusMap[peginRequest.status as keyof typeof statusMap] || "Pending",
    providers: [{ id: peginRequest.vaultProvider }],
    date: new Date().toISOString(), // Timestamp will be enhanced with actual transaction date
  };
}
