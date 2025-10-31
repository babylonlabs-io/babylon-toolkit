// BTC Vault Controller - Read operations (queries)

import { type Abi, type Address, type Hex } from "viem";

import { ethClient } from "../client";
import { normalizeMarketId } from "../morpho/utils";
import { executeMulticall } from "../multicall-helpers";

import BTCVaultControllerABI from "./abis/BTCVaultController.abi.json";

/**
 * Depositor structure from contract
 */
interface DepositorStruct {
  ethAddress: Address;
  btcPubKey: Hex;
}

/**
 * Market position structure from the positions mapping
 */
export interface MarketPosition {
  depositor: {
    ethAddress: Address;
    btcPubKey: Hex;
  };
  marketId: Hex;
  proxyContract: Address;
  pegInTxHashes: Hex[]; // Array of vault transaction hashes (pegin tx hashes)
  totalCollateral: bigint;
  totalBorrowed: bigint;
  lastUpdateTimestamp: bigint;
}

/**
 * Get all position IDs for a user
 *
 * Iterates through the userPositions array by calling userPositions(address, index)
 * starting from index 0 and incrementing until an error occurs or no result is returned.
 *
 * @param contractAddress - BTCVaultController contract address
 * @param userAddress - User's Ethereum address
 * @returns Array of position IDs (bytes32)
 */
export async function getUserPositions(
  contractAddress: Address,
  userAddress: Address,
): Promise<Hex[]> {
  const publicClient = ethClient.getPublicClient();
  const positions: Hex[] = [];
  let index = 0;

  try {
    while (true) {
      try {
        const result = await publicClient.readContract({
          address: contractAddress,
          abi: BTCVaultControllerABI,
          functionName: "userPositions",
          args: [userAddress, BigInt(index)],
        });

        // If we get a valid result, add it to the array
        if (result) {
          positions.push(result as Hex);
          index++;
        } else {
          // No result returned, we've reached the end
          break;
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        // Error occurred (likely out of bounds), we've reached the end of the array
        break;
      }
    }

    return positions;
  } catch (error) {
    throw new Error(
      `Failed to get user positions: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Get the position ID (key) for a user in a specific market
 * This is a pure function that calculates the position ID from depositor + marketId
 *
 * @param contractAddress - BTCVaultController contract address
 * @param userAddress - User's Ethereum address
 * @param marketId - Market ID (bytes32, with or without 0x prefix)
 * @returns Position ID (bytes32)
 */
export async function getPositionKey(
  contractAddress: Address,
  userAddress: Address,
  marketId: string | bigint,
): Promise<Hex> {
  const publicClient = ethClient.getPublicClient();

  // Normalize market ID to ensure it has 0x prefix
  const normalizedMarketId = normalizeMarketId(marketId);

  const positionId = await publicClient.readContract({
    address: contractAddress,
    abi: BTCVaultControllerABI,
    functionName: "getPositionKey",
    args: [userAddress, normalizedMarketId],
  });

  return positionId as Hex;
}

/**
 * Get a single position for a user in a specific market
 * This is more efficient than fetching all positions when you only need one
 *
 * @param contractAddress - BTCVaultController contract address
 * @param userAddress - User's Ethereum address
 * @param marketId - Market ID (bytes32, with or without 0x prefix)
 * @returns Market position or null if position doesn't exist
 */
export async function getPosition(
  contractAddress: Address,
  userAddress: Address,
  marketId: string | bigint,
): Promise<MarketPosition | null> {
  try {
    const publicClient = ethClient.getPublicClient();

    // Normalize market ID to ensure it has 0x prefix
    const normalizedMarketId = normalizeMarketId(marketId);

    const result = await publicClient.readContract({
      address: contractAddress,
      abi: BTCVaultControllerABI,
      functionName: "getPosition",
      args: [userAddress, normalizedMarketId],
    });

    // Type assertion for the result tuple
    type PositionResult = {
      depositor: DepositorStruct;
      marketId: Hex;
      proxyContract: Address;
      pegInTxHashes: Hex[];
      totalCollateral: bigint;
      totalBorrowed: bigint;
      lastUpdateTimestamp: bigint;
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
        ethAddress: position.depositor.ethAddress as Address,
        btcPubKey: position.depositor.btcPubKey as Hex,
      },
      marketId: position.marketId,
      proxyContract: position.proxyContract,
      pegInTxHashes: position.pegInTxHashes,
      totalCollateral: position.totalCollateral,
      totalBorrowed: position.totalBorrowed,
      lastUpdateTimestamp: position.lastUpdateTimestamp,
    };
  } catch (error) {
    // Position doesn't exist or error fetching
    console.error(
      `Failed to get position for user ${userAddress} in market ${marketId}:`,
      error,
    );
    return null;
  }
}

/**
 * Bulk get position data for multiple position IDs
 * Uses multicall to batch requests into a single RPC call for better performance
 *
 * Note: Filters out failed requests automatically. If you need to track which requests failed,
 * consider using the return value's length compared to input length.
 *
 * IMPORTANT: This fetches from `positions` mapping which does NOT include pegInTxHashes.
 * To get complete position data with pegInTxHashes, you need to call getPosition() for each position,
 * but that requires depositor address + marketId (not position ID).
 *
 * @param contractAddress - BTCVaultController contract address
 * @param positionIds - Array of position IDs (bytes32)
 * @returns Array of market positions (only successful fetches, failed requests are filtered out)
 */
export async function getPositionsBulk(
  contractAddress: Address,
  positionIds: Hex[],
): Promise<MarketPosition[]> {
  if (positionIds.length === 0) {
    return [];
  }

  try {
    const publicClient = ethClient.getPublicClient();

    // Use shared multicall helper
    // NOTE: The `positions` mapping returns data WITHOUT pegInTxHashes
    // The ABI output is: [depositor, marketId, proxyContract, totalCollateral, totalBorrowed, lastUpdateTimestamp]
    type MarketPositionRaw = [
      DepositorStruct,
      Hex,
      Address,
      bigint,
      bigint,
      bigint,
    ];
    const results = await executeMulticall<MarketPositionRaw>(
      publicClient,
      contractAddress,
      BTCVaultControllerABI as Abi,
      "positions",
      positionIds.map((positionId) => [positionId]),
    );

    // Transform raw results to MarketPosition format
    // pegInTxHashes will be empty array since positions mapping doesn't return it
    return results.map(
      ([
        depositor,
        marketId,
        proxyContract,
        totalCollateral,
        totalBorrowed,
        lastUpdateTimestamp,
      ]) => ({
        depositor: {
          ethAddress: depositor.ethAddress as Address,
          btcPubKey: depositor.btcPubKey as Hex,
        },
        marketId,
        proxyContract,
        pegInTxHashes: [], // positions mapping doesn't return this - must use getPosition() instead
        totalCollateral,
        totalBorrowed,
        lastUpdateTimestamp,
      }),
    );
  } catch (error) {
    throw new Error(
      `Failed to bulk fetch positions: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
