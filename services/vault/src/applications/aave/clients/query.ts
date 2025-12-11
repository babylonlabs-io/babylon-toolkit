/**
 * Aave Integration Controller - Read operations (queries)
 *
 * Only includes functions that provide data NOT available from the indexer.
 * Most position/vault data should be fetched from the GraphQL indexer instead.
 */

import { type Address, type Hex } from "viem";

import { ethClient } from "../../../clients/eth-contract/client";

import AaveIntegrationControllerABI from "./abis/AaveIntegrationController.abi.json";

/**
 * Depositor structure from contract
 */
interface DepositorStruct {
  ethAddress: Address;
  btcPubKey: Hex;
}

/**
 * Aave position structure from the contract
 */
export interface AaveMarketPosition {
  depositor: {
    ethAddress: Address;
    btcPubKey: Hex;
  };
  reserveId: bigint;
  proxyContract: Address;
  vaultIds: Hex[];
  totalCollateral: bigint;
}

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

  try {
    const result = await publicClient.readContract({
      address: contractAddress,
      abi: AaveIntegrationControllerABI,
      functionName: "getPosition",
      args: [positionId],
    });

    type PositionResult = {
      depositor: DepositorStruct;
      reserveId: bigint;
      proxyContract: Address;
      vaultIds: Hex[];
      totalCollateral: bigint;
    };

    const position = result as PositionResult;

    // Check if position exists (proxyContract should not be zero address)
    if (
      position.proxyContract === "0x0000000000000000000000000000000000000000"
    ) {
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
      totalCollateral: position.totalCollateral,
    };
  } catch (error) {
    console.error(`Failed to get position ${positionId}:`, error);
    return null;
  }
}
