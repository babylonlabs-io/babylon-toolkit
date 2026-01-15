/**
 * Aave Integration Controller - Read operations (queries)
 *
 * Vault-side wrapper that injects ethClient into SDK functions.
 * Only includes functions that provide data NOT available from the indexer.
 */

import type { AaveMarketPosition } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { getPosition as sdkGetPosition } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import type { Address, Hex } from "viem";

import { ethClient } from "../../../clients/eth-contract/client";

/**
 * Get a position by its ID
 *
 * NOTE: Prefer using the indexer (fetchAavePositionWithCollaterals) for position data.
 * This function is only needed when you need data not available in the indexer,
 * or when you need to verify on-chain state.
 *
 * @param contractAddress - AaveIntegrationController contract address
 * @param positionId - Position ID (bytes32)
 * @returns Market position data or null if position doesn't exist
 */
export async function getPosition(
  contractAddress: Address,
  positionId: Hex,
): Promise<AaveMarketPosition | null> {
  const publicClient = ethClient.getPublicClient();
  return sdkGetPosition(publicClient, contractAddress, positionId);
}

// Re-export types
export type { AaveMarketPosition };
