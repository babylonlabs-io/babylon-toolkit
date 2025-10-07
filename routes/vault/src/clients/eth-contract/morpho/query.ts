// Morpho Protocol - Read operations (queries)

import type { Address, Hex } from 'viem';
import { ethClient } from '../client';
import { toHex } from 'viem';
import { fetchMarket } from '@morpho-org/blue-sdk-viem';
import { AccrualPosition } from '@morpho-org/blue-sdk-viem/lib/augment/Position';
import { registerCustomAddresses } from '@morpho-org/blue-sdk';
import type { MarketId } from '@morpho-org/blue-sdk';
import type { MorphoMarketSummary, MorphoUserPosition } from './types';
import { network } from '@babylonlabs-io/config';

// Localhost Morpho contract address
export const LOCALHOST_MORPHO_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as Address;

// Helper to create localhost chain addresses for Morpho SDK
const createLocalhostAddresses = () => ({
  morpho: LOCALHOST_MORPHO_ADDRESS,
  adaptiveCurveIrm: '0x0000000000000000000000000000000000000000' as Address,
  bundler3: {
    bundler3: '0x0000000000000000000000000000000000000000' as Address,
    generalAdapter1: '0x0000000000000000000000000000000000000000' as Address,
  },
});

// Track if we've already registered addresses for a given chain ID
const registeredChainIds = new Set<number>();

// Helper to ensure localhost addresses are registered for the current chain
async function ensureLocalhostAddressesRegistered() {
  const publicClient = ethClient.getPublicClient();
  const chainId = await publicClient.getChainId();

  // Register for localhost if either network is localhost OR chain ID is 31337
  const isLocalhost = network === 'localhost' || chainId === 31337;
  if (!isLocalhost) return;

  // Only register if not already registered for this chain ID
  if (!registeredChainIds.has(chainId)) {
    registerCustomAddresses({
      addresses: {
        [chainId]: createLocalhostAddresses(),
      },
    });
    registeredChainIds.add(chainId);
  }
}

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

  // Ensure localhost addresses are registered before fetching
  await ensureLocalhostAddressesRegistered();

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

  // Ensure localhost addresses are registered before fetching
  await ensureLocalhostAddressesRegistered();

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
