// Block utilities for converting block numbers to dates

import { ethClient } from "../clients/eth-contract/client";

/**
 * Convert a block number to a formatted date string
 *
 * @param blockNumber - The block number to convert
 * @returns Formatted date string (YYYY-MM-DD) or "Unknown" if conversion fails
 */
export async function blockToDateString(blockNumber: number): Promise<string> {
  try {
    const publicClient = ethClient.getPublicClient();
    const block = await publicClient.getBlock({
      blockNumber: BigInt(blockNumber),
    });

    if (!block.timestamp) {
      return "Unknown";
    }

    const date = new Date(Number(block.timestamp) * 1000);
    return date.toISOString().split("T")[0]; // Returns YYYY-MM-DD format
  } catch (error) {
    console.warn(`Failed to fetch block ${blockNumber}:`, error);
    return "Unknown";
  }
}

/**
 * Convert a block number to a Date object
 *
 * @param blockNumber - The block number to convert
 * @returns Date object or null if conversion fails
 */
export async function blockToDate(blockNumber: number): Promise<Date | null> {
  try {
    const publicClient = ethClient.getPublicClient();
    const block = await publicClient.getBlock({
      blockNumber: BigInt(blockNumber),
    });

    if (!block.timestamp) {
      return null;
    }

    return new Date(Number(block.timestamp) * 1000);
  } catch (error) {
    console.warn(`Failed to fetch block ${blockNumber}:`, error);
    return null;
  }
}

/**
 * Estimate date from block number using average block time
 * This is a fallback when we can't fetch the actual block timestamp
 *
 * @param blockNumber - The block number to estimate
 * @param genesisBlock - The genesis block number (default: 0)
 * @param genesisTimestamp - The genesis block timestamp in seconds (default: 1438269988 for Ethereum mainnet)
 * @param averageBlockTime - Average block time in seconds (default: 12 for Ethereum)
 * @returns Estimated date string (YYYY-MM-DD)
 */
export function estimateDateFromBlock(
  blockNumber: number,
  genesisBlock: number = 0,
  genesisTimestamp: number = 1438269988, // Ethereum mainnet genesis
  averageBlockTime: number = 12, // 12 seconds average block time
): string {
  const blocksSinceGenesis = blockNumber - genesisBlock;
  const estimatedTimestamp =
    genesisTimestamp + blocksSinceGenesis * averageBlockTime;
  const date = new Date(estimatedTimestamp * 1000);
  return date.toISOString().split("T")[0]; // Returns YYYY-MM-DD format
}
