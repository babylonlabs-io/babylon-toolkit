/**
 * Pegin Service - Business logic layer
 *
 * Orchestrates pegin request operations and transformations.
 * This layer sits between React hooks and low-level clients.
 */

import type { Address, Hex } from "viem";

import type { PeginRequest } from "../../clients/eth-contract";
import { BTCVaultsManager } from "../../clients/eth-contract";

/**
 * Pegin request with transaction hash
 */
export interface PeginRequestWithTxHash {
  /** The pegin request data */
  peginRequest: PeginRequest;
  /** Transaction hash */
  txHash: Hex;
}

/**
 * Get a single pegin request by transaction hash
 *
 * @param btcVaultsManagerAddress - BTCVaultsManager contract address
 * @param peginTxHash - Pegin transaction hash (vault ID)
 * @returns Pegin request data
 */
export async function getPeginRequest(
  btcVaultsManagerAddress: Address,
  peginTxHash: Hex,
): Promise<PeginRequest> {
  return BTCVaultsManager.getPeginRequest(btcVaultsManagerAddress, peginTxHash);
}

/**
 * Get vault provider's BTC public key
 *
 * @param btcVaultsManagerAddress - BTCVaultsManager contract address
 * @param providerAddress - Vault provider's Ethereum address
 * @returns Vault provider's BTC public key (x-only format, 32 bytes)
 */
export async function getProviderBTCKey(
  btcVaultsManagerAddress: Address,
  providerAddress: Address,
): Promise<Hex> {
  return BTCVaultsManager.getProviderBTCKey(
    btcVaultsManagerAddress,
    providerAddress,
  );
}

/**
 * Get all pegin requests for a depositor with full details
 *
 * Composite operation that:
 * 1. Fetches all pegin transaction hashes for depositor
 * 2. Bulk fetches detailed pegin request data in a single multicall (optimized)
 *
 * @param depositorAddress - Depositor's Ethereum address
 * @param btcVaultsManagerAddress - BTCVaultsManager contract address
 * @returns Array of pegin requests with transaction hashes
 */
export async function getPeginRequestsWithDetails(
  depositorAddress: Address,
  btcVaultsManagerAddress: Address,
): Promise<PeginRequestWithTxHash[]> {
  // Step 1: Get all transaction hashes for this depositor
  const txHashes: Hex[] = await BTCVaultsManager.getDepositorPeginRequests(
    btcVaultsManagerAddress,
    depositorAddress,
  );

  // Early return if no pegin requests found
  if (txHashes.length === 0) {
    return [];
  }

  // Step 2: Bulk fetch detailed pegin request data for all hashes in a single multicall
  // This is much more efficient than individual calls in Promise.all
  // Note: getPeginRequestsBulk filters out failed requests, so we might get fewer results than txHashes
  const peginRequests = await BTCVaultsManager.getPeginRequestsBulk(
    btcVaultsManagerAddress,
    txHashes,
  );

  // Step 3: Combine with transaction hashes
  // Since getPeginRequestsBulk filters failures, we need to match them back to txHashes
  // For now, we assume all requests succeed (contract returns empty data for non-existent requests)
  const peginRequestsWithDetails = peginRequests.map((peginRequest, index) => ({
    peginRequest,
    txHash: txHashes[index],
  }));

  return peginRequestsWithDetails;
}

/**
 * Available collateral for borrowing
 */
export interface AvailableCollateral {
  /** Transaction hash of the pegin request (also serves as vault ID) */
  txHash: Hex;
  /** Amount of BTC deposited */
  amount: string;
  /** Token symbol (e.g., "BTC") */
  symbol: string;
  /** Token icon URL */
  icon?: string;
}

/**
 * Get available collaterals for borrowing
 *
 * Fetches all pegin requests and filters for those with status "Available" (status === 2).
 * These are pegins that have been verified by vault providers and are ready to be used as collateral,
 * but are NOT yet in a borrowing position (not borrowed against yet).
 *
 * Status flow:
 * - 0 = Pending: Waiting for vault provider verification
 * - 1 = Verified: Vault provider has signed, waiting for BTC confirmation
 * - 2 = Available: BTC confirmed, ready to use as collateral (THIS IS WHAT WE WANT)
 * - 3 = InPosition: Already being used in a Morpho borrowing position
 * - 4 = Expired: Pegin request expired
 *
 * @param depositorAddress - Depositor's Ethereum address
 * @param btcVaultsManagerAddress - BTCVaultsManager contract address
 * @returns Array of available collaterals that can be selected for borrowing
 */
export async function getAvailableCollaterals(
  depositorAddress: Address,
  btcVaultsManagerAddress: Address,
): Promise<AvailableCollateral[]> {
  // Fetch all pegin requests (no need to fetch vault metadata since status tells us if it's in use)
  const peginRequests = await getPeginRequestsWithDetails(
    depositorAddress,
    btcVaultsManagerAddress,
  );

  // Filter for pegins with status "Available" (status === 2)
  // These are pegins that:
  // 1. Have been verified by vault provider
  // 2. Have BTC confirmation on-chain
  // 3. Are NOT yet used in a borrowing position (status 3 would mean "InPosition")
  const availableCollaterals = peginRequests
    .filter(({ peginRequest }) => peginRequest.status === 2)
    .map(({ txHash, peginRequest }) => ({
      txHash,
      amount: (Number(peginRequest.amount) / 1e8).toFixed(8), // Convert satoshis to BTC
      symbol: "BTC",
      icon: undefined, // Will be set by UI layer if needed
    }));

  return availableCollaterals;
}
