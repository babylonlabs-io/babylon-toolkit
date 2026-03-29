/**
 * Aave Integration Adapter - Read operations (queries)
 *
 * Only includes functions that provide data NOT available from the indexer.
 * Most position/vault data should be fetched from the GraphQL indexer instead.
 */

import { type Address, type Hex, type PublicClient, zeroAddress } from "viem";

import type { AaveMarketPosition } from "../types.js";
import AaveIntegrationAdapterABI from "./abis/AaveIntegrationAdapter.abi.json";

/**
 * Get a position by user address.
 *
 * The adapter resolves the user's proxy contract and collateralized vault IDs.
 *
 * NOTE: Prefer using the indexer (fetchAavePositionWithCollaterals) for position data.
 * This function is only needed when you need data not available in the indexer,
 * or when you need to verify on-chain state.
 *
 * @param publicClient - Viem public client for reading contracts
 * @param contractAddress - AaveIntegrationAdapter contract address
 * @param user - User's Ethereum address
 * @returns Market position data or null if position doesn't exist
 */
export async function getPosition(
  publicClient: PublicClient,
  contractAddress: Address,
  user: Address,
): Promise<AaveMarketPosition | null> {
  const result = await publicClient.readContract({
    address: contractAddress,
    abi: AaveIntegrationAdapterABI,
    functionName: "getPosition",
    args: [user],
  });

  type PositionResult = {
    proxyContract: Address;
    vaultIds: Hex[];
  };

  const position = result as PositionResult;

  // Check if position exists (proxyContract should not be zero address)
  if (position.proxyContract === zeroAddress) {
    return null;
  }

  return {
    proxyContract: position.proxyContract,
    vaultIds: position.vaultIds,
  };
}

/**
 * Get total collateral for a user's position.
 *
 * @param publicClient - Viem public client for reading contracts
 * @param contractAddress - AaveIntegrationAdapter contract address
 * @param user - User's Ethereum address
 * @returns Total collateral amount in satoshis
 */
export async function getPositionCollateral(
  publicClient: PublicClient,
  contractAddress: Address,
  user: Address,
): Promise<bigint> {
  const result = await publicClient.readContract({
    address: contractAddress,
    abi: AaveIntegrationAdapterABI,
    functionName: "getPositionCollateral",
    args: [user],
  });

  return result as bigint;
}
