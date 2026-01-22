/**
 * Aave Integration Controller - Read operations (queries)
 *
 * Only includes functions that provide data NOT available from the indexer.
 * Most position/vault data should be fetched from the GraphQL indexer instead.
 */

import { type Address, type Hex, type PublicClient } from "viem";

import type { AaveMarketPosition } from "../types.js";
import AaveIntegrationControllerABI from "./abis/AaveIntegrationController.abi.json";

const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

/**
 * Get a position by its ID
 *
 * NOTE: Prefer using the indexer (fetchAavePositionWithCollaterals) for position data.
 * This function is only needed when you need data not available in the indexer,
 * or when you need to verify on-chain state.
 *
 * @param publicClient - Viem public client for reading contracts
 * @param contractAddress - AaveIntegrationController contract address
 * @param positionId - Position ID (bytes32)
 * @returns Market position data or null if position doesn't exist
 */
export async function getPosition(
  publicClient: PublicClient,
  contractAddress: Address,
  positionId: Hex,
): Promise<AaveMarketPosition | null> {
  const result = await publicClient.readContract({
    address: contractAddress,
    abi: AaveIntegrationControllerABI,
    functionName: "getPosition",
    args: [positionId],
  });

  type PositionResult = {
    depositor: {
      ethAddress: Address;
      btcPubKey: Hex;
    };
    reserveId: bigint;
    proxyContract: Address;
    vaultIds: Hex[];
  };

  const position = result as PositionResult;

  // Check if position exists (proxyContract should not be zero address)
  if (position.proxyContract === ZERO_ADDRESS) {
    return null;
  }

  return {
    depositor: {
      ethAddress: position.depositor.ethAddress,
      btcPubKey: position.depositor.btcPubKey,
    },
    reserveId: position.reserveId,
    proxyContract: position.proxyContract,
    vaultIds: position.vaultIds,
  };
}

/**
 * Get total collateral for a position
 *
 * @param publicClient - Viem public client for reading contracts
 * @param contractAddress - AaveIntegrationController contract address
 * @param positionId - Position ID (bytes32)
 * @returns Total collateral amount
 */
export async function getPositionCollateral(
  publicClient: PublicClient,
  contractAddress: Address,
  positionId: Hex,
): Promise<bigint> {
  const result = await publicClient.readContract({
    address: contractAddress,
    abi: AaveIntegrationControllerABI,
    functionName: "getPositionCollateral",
    args: [positionId],
  });

  return result as bigint;
}
