/**
 * Morpho Market Contract Service
 *
 * Handles Morpho market operations:
 * - Fetching static market params from GraphQL indexer
 * - Fetching dynamic market data from Morpho contract
 * - Validating markets against on-chain state
 * - Getting user positions
 */

import type { Address } from "viem";

import {
  Morpho,
  type MorphoMarketSummary,
  type MorphoUserPosition,
} from "../clients";

import { fetchMorphoMarketById, type MorphoMarket } from "./fetchMarkets";

/**
 * Basic market parameters (immutable after market creation)
 */
export interface BasicMarketParams {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
}

/**
 * In-memory cache for market parameters.
 * These values are immutable after market creation, so we can cache them indefinitely.
 */
const marketParamsCache = new Map<string, BasicMarketParams>();

/**
 * Normalize market ID to lowercase hex string for consistent cache keys
 */
function normalizeMarketId(marketId: string | bigint): string {
  if (typeof marketId === "bigint") {
    return `0x${marketId.toString(16).toLowerCase()}`;
  }
  return marketId.toLowerCase();
}

/**
 * Market summary data from Morpho contract
 * Re-exported from eth-contract client
 */
export type { MorphoMarketSummary, MorphoUserPosition } from "../clients";

/**
 * Market with validation status
 */
export interface MarketWithValidation extends MorphoMarket {
  /** Whether this market exists on-chain in Morpho contract */
  isValid: boolean;
  /** Error message if validation failed */
  validationError?: string;
  /** On-chain market data from Morpho (if valid) */
  onChainData?: {
    totalSupplyAssets: bigint;
    totalBorrowAssets: bigint;
    utilizationPercent: number;
  };
}

/**
 * Result of validating multiple markets
 */
export interface MarketsWithValidationResult {
  markets: MarketWithValidation[];
  /** Whether all markets are valid */
  allValid: boolean;
  /** Markets that failed validation */
  invalidMarkets: MarketWithValidation[];
}

/**
 * Validate a single market against on-chain Morpho contract
 *
 * @param market - Market to validate
 * @returns Market with validation status and on-chain data
 */
export async function validateMarket(
  market: MorphoMarket,
): Promise<MarketWithValidation> {
  try {
    // Fetch market data directly from Morpho contract (no IRM calls)
    const onChainMarket = await Morpho.getMarketWithData(market.id);

    return {
      ...market,
      isValid: true,
      onChainData: {
        totalSupplyAssets: onChainMarket.totalSupplyAssets,
        totalBorrowAssets: onChainMarket.totalBorrowAssets,
        utilizationPercent: onChainMarket.utilizationPercent,
      },
    };
  } catch (error) {
    // Market doesn't exist on Morpho contract or fetch failed
    return {
      ...market,
      isValid: false,
      validationError:
        error instanceof Error
          ? error.message
          : "Failed to fetch market from Morpho contract",
    };
  }
}

/**
 * Get on-chain market data from Morpho contract
 *
 * @param marketId - Market ID
 * @returns Market data including supply, borrow, utilization, etc.
 */
export async function getMarketData(
  marketId: string | bigint,
): Promise<MorphoMarketSummary> {
  return Morpho.getMarketWithData(marketId);
}

/**
 * Get user's position in a specific market
 *
 * @param marketId - Market ID
 * @param userProxyAddress - User's proxy contract address
 * @returns User's position with supply shares, borrow shares, borrow assets, and collateral
 */
export async function getUserMarketPosition(
  marketId: string | bigint,
  userProxyAddress: Address,
): Promise<MorphoUserPosition> {
  return Morpho.getUserPosition(marketId, userProxyAddress);
}

/**
 * Get basic market parameters with in-memory caching
 *
 * First checks the in-memory cache, then falls back to GraphQL indexer.
 * These values are immutable after market creation, so caching is safe.
 *
 * @param marketId - Market ID (hex string or bigint)
 * @returns Market parameters (loanToken, collateralToken, oracle, irm, lltv)
 * @throws Error if market not found in indexer
 */
export async function getBasicMarketParams(
  marketId: string | bigint,
): Promise<BasicMarketParams> {
  const cacheKey = normalizeMarketId(marketId);

  // Check cache first
  const cached = marketParamsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch from GraphQL indexer
  const market = await fetchMorphoMarketById(cacheKey);

  if (!market) {
    throw new Error(`Market not found in indexer for ID: ${cacheKey}`);
  }

  const params: BasicMarketParams = {
    loanToken: market.loanTokenAddress as Address,
    collateralToken: market.collateralTokenAddress as Address,
    oracle: market.oracleAddress as Address,
    irm: market.irm as Address,
    lltv: BigInt(market.lltv),
  };

  // Store in cache
  marketParamsCache.set(cacheKey, params);

  return params;
}

/**
 * Clear the market params cache (useful for testing or forced refresh)
 */
export function clearMarketParamsCache(): void {
  marketParamsCache.clear();
}
