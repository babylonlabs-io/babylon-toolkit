// Morpho Protocol - Read operations (queries)

import type { Address } from 'viem';
import { ethClient } from '../client';
import { fetchMarket } from '@morpho-org/blue-sdk-viem';
import { AccrualPosition } from '@morpho-org/blue-sdk-viem/lib/augment/Position';
import type { MarketId } from '@morpho-org/blue-sdk';
import type { MorphoMarketSummary, MorphoUserPosition } from './types';
import { getMorphoAddress } from './config';
import { normalizeMarketId } from './utils';

// Minimal ABI for idToMarketParams function
const MORPHO_ID_TO_MARKET_PARAMS_ABI = [
  {
    type: 'function',
    name: 'idToMarketParams',
    inputs: [{ name: 'id', type: 'bytes32', internalType: 'Id' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct MarketParams',
        components: [
          { name: 'loanToken', type: 'address', internalType: 'address' },
          { name: 'collateralToken', type: 'address', internalType: 'address' },
          { name: 'oracle', type: 'address', internalType: 'address' },
          { name: 'irm', type: 'address', internalType: 'address' },
          { name: 'lltv', type: 'uint256', internalType: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const;

/**
 * Get basic market parameters directly from Morpho contract (lightweight, no IRM calls)
 *
 * This is a lightweight function that makes a single contract call to fetch only the
 * 5 core market parameters needed for transactions.
 *
 * Use this when:
 * - Constructing transactions (borrow, repay, etc.)
 * - You only need market parameters, not market state
 * - Performance is critical (avoids SDK overhead and IRM calls)
 *
 * For UI display with market metrics, use getMarketWithData() instead.
 *
 * @param id - Market ID (hex string or bigint)
 * @returns Market parameters only (loanToken, collateralToken, oracle, irm, lltv)
 */
export async function getBasicMarketParams(
  id: string | bigint
): Promise<{
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
}> {
  try {
    const publicClient = ethClient.getPublicClient();
    const morphoAddress = getMorphoAddress();

    // Normalize market ID to bytes32 hex format
    const marketId = normalizeMarketId(id);

    // Call idToMarketParams directly from contract
    const result = await publicClient.readContract({
      address: morphoAddress,
      abi: MORPHO_ID_TO_MARKET_PARAMS_ABI,
      functionName: 'idToMarketParams',
      args: [marketId],
    });

    // Check if market exists (loanToken should not be zero address)
    if (result.loanToken === '0x0000000000000000000000000000000000000000') {
      throw new Error(`Market does not exist for ID: ${id}`);
    }

    // Result is a tuple with market parameters
    return {
      loanToken: result.loanToken,
      collateralToken: result.collateralToken,
      oracle: result.oracle,
      irm: result.irm,
      lltv: result.lltv,
    };
  } catch (error) {
    throw new Error(
      `Failed to fetch market params for ID ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get comprehensive market data using Morpho SDK (includes market state and metrics)
 *
 * This fetches full market information including:
 * - Market parameters (tokens, oracle, IRM, LLTV)
 * - Market state (total supply/borrow, shares, fees, last update)
 * - Derived metrics (utilization %, LLTV %)
 *
 * Use this when:
 * - Displaying market information in the UI
 * - You need market state and analytics
 * - You need utilization rates or supply/borrow totals
 *
 * Note: This makes multiple contract calls including the IRM contract.
 * For transaction construction, use getBasicMarketParams() instead.
 *
 * @param id - Market ID (hex string or bigint)
 * @returns Complete market data including state and metrics
 */
export async function getMarketWithData(
  id: string | bigint
): Promise<MorphoMarketSummary> {
  const publicClient = ethClient.getPublicClient();

  // Normalize market ID to bytes32 hex format
  const marketId = normalizeMarketId(id);

  // Use Morpho SDK for all networks (including localhost)
  const market = await fetchMarket(marketId as MarketId, publicClient);

  // Calculate derived values
  const totalSupply = market.totalSupplyAssets;
  const totalBorrow = market.totalBorrowAssets;
  const utilization = totalSupply > 0n ? Number((totalBorrow * 10000n) / totalSupply) / 100 : 0;
  const lltvPercent = Number(market.params.lltv) / 1e16;

  return {
    id: typeof id === 'bigint' ? id.toString() : id,
    loanToken: {
      address: market.params.loanToken as Address,
      symbol: '', // SDK doesn't directly provide token symbols
    },
    collateralToken: {
      address: market.params.collateralToken as Address,
      symbol: '', // SDK doesn't directly provide token symbols
    },
    oracle: market.params.oracle as Address,
    irm: market.params.irm as Address,
    lltv: market.params.lltv,
    totalSupplyAssets: market.totalSupplyAssets,
    totalSupplyShares: market.totalSupplyShares,
    totalBorrowAssets: market.totalBorrowAssets,
    totalBorrowShares: market.totalBorrowShares,
    lastUpdate: market.lastUpdate,
    fee: market.fee,
    utilizationPercent: utilization,
    lltvPercent,
  };
}

/**
 * Get a user's position in a specific Morpho market
 * @param marketId - Market ID (string or bigint)
 * @param userProxyContractAddress - User's proxy contract address for the vault
 * @returns User's position with supply shares, borrow shares, borrow assets (actual debt), and collateral
 */
export async function getUserPosition(
  marketId: string | bigint,
  userProxyContractAddress: Address
): Promise<MorphoUserPosition> {
  const publicClient = ethClient.getPublicClient();

  // Normalize market ID to bytes32 hex format
  const marketIdHex = normalizeMarketId(marketId);

  // Fetch position using AccrualPosition to get borrowAssets (actual debt with interest)
  const position = await AccrualPosition.fetch(
    userProxyContractAddress,
    marketIdHex as MarketId,
    publicClient
  );

  return {
    marketId: typeof marketId === 'bigint' ? marketId.toString() : marketId,
    user: userProxyContractAddress,
    supplyShares: position.supplyShares,
    borrowShares: position.borrowShares,
    borrowAssets: position.borrowAssets, // Actual debt including accrued interest
    collateral: position.collateral,
  };
}

/**
 * Bulk get user positions for multiple proxy contracts in the same market
 * Fetches all positions in parallel for better performance
 *
 * @param marketId - Market ID (string or bigint)
 * @param proxyContractAddresses - Array of proxy contract addresses
 * @returns Array of user positions (undefined for addresses with no position)
 */
export async function getUserPositionsBulk(
  marketId: string | bigint,
  proxyContractAddresses: Address[]
): Promise<(MorphoUserPosition | undefined)[]> {
  if (proxyContractAddresses.length === 0) {
    return [];
  }

  const publicClient = ethClient.getPublicClient();

  // Normalize market ID to bytes32 hex format
  const marketIdHex = normalizeMarketId(marketId);

  // Fetch all positions in parallel
  const results = await Promise.allSettled(
    proxyContractAddresses.map(async (proxyAddress) => {
      const position = await AccrualPosition.fetch(
        proxyAddress,
        marketIdHex as MarketId,
        publicClient
      );

      return {
        marketId: typeof marketId === 'bigint' ? marketId.toString() : marketId,
        user: proxyAddress,
        supplyShares: position.supplyShares,
        borrowShares: position.borrowShares,
        borrowAssets: position.borrowAssets,
        collateral: position.collateral,
      };
    })
  );

  // Map results, returning undefined for failed fetches
  return results.map((result) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    // Position doesn't exist or error fetching
    return undefined;
  });
}
