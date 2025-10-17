// Morpho Protocol - Read operations (queries)

import type { Address, Hex } from 'viem';
import { ethClient } from '../client';
import { toHex } from 'viem';
import { fetchMarket } from '@morpho-org/blue-sdk-viem';
import { AccrualPosition } from '@morpho-org/blue-sdk-viem/lib/augment/Position';
import type { MarketId } from '@morpho-org/blue-sdk';
import type { MorphoMarketSummary, MorphoUserPosition } from './types';

/**
 * Get Morpho market information by ID using the official Morpho SDK
 * Supports both production networks and localhost (via registerCustomAddresses)
 * @param id - Market ID (string or bigint)
 * @returns Market summary with tokens, LLTV, and market data
 */
export async function getMarketById(
  id: string | bigint
): Promise<MorphoMarketSummary> {
  const publicClient = ethClient.getPublicClient();
  const marketId: Hex = toHex(typeof id === 'bigint' ? id : BigInt(id), { size: 32 });

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
  const marketIdHex: Hex = toHex(typeof marketId === 'bigint' ? marketId : BigInt(marketId), { size: 32 });

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
