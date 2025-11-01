/**
 * Market Service - Business logic for Morpho market operations
 *
 * Handles market-related read operations including:
 * - Fetching markets from vault-indexer API
 * - Validating markets against on-chain Morpho contract
 * - Getting market data and user positions
 *
 * This service acts as the single source of truth for market-related operations.
 * All hooks should import from this service, never directly from clients.
 */

import type { Address } from "viem";

import type {
  MorphoMarketSummary,
  MorphoUserPosition,
} from "../../clients/eth-contract";
import { Morpho } from "../../clients/eth-contract";
import { VaultApiClient } from "../../clients/vault-api";
import {
  DEFAULT_TIMEOUT,
  getVaultApiUrl,
} from "../../clients/vault-api/config";
import type { MorphoMarket } from "../../clients/vault-api/types";

/**
 * Market summary data from Morpho contract
 * Re-exported from eth-contract client
 */
export type { MorphoMarketSummary } from "../../clients/eth-contract";

/**
 * User position in a Morpho market
 * Re-exported from eth-contract client
 */
export type { MorphoUserPosition } from "../../clients/eth-contract";

/**
 * Market configuration from vault-indexer API
 * Re-exported from vault-api client
 */
export type { MorphoMarket } from "../../clients/vault-api/types";

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
 * Get all markets from vault-indexer API
 *
 * @returns Array of market information from API
 */
export async function getMarkets(): Promise<MorphoMarket[]> {
  const client = new VaultApiClient(getVaultApiUrl(), DEFAULT_TIMEOUT);
  return client.getMarkets();
}

/**
 * Get a specific market by ID from vault-indexer API
 *
 * @param marketId - Market ID to fetch
 * @returns Market information or null if not found
 */
export async function getMarketById(
  marketId: string,
): Promise<MorphoMarket | null> {
  const markets = await getMarkets();
  return markets.find((market) => market.id === marketId) || null;
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
 * Get all markets from API and validate them against on-chain Morpho contract
 *
 * This validates that each market ID from the API actually exists on-chain
 * in the Morpho contract, providing early detection of configuration issues.
 *
 * @returns Validated markets with on-chain data
 */
export async function getMarketsWithValidation(): Promise<MarketsWithValidationResult> {
  // Step 1: Fetch markets from API
  const apiMarkets = await getMarkets();

  // Step 2: Validate each market on-chain and fetch data
  const validatedMarkets = await Promise.all(
    apiMarkets.map((market) => validateMarket(market)),
  );

  // Step 3: Separate valid and invalid markets
  const invalidMarkets = validatedMarkets.filter((m) => !m.isValid);
  const allValid = invalidMarkets.length === 0;

  return {
    markets: validatedMarkets,
    allValid,
    invalidMarkets,
  };
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
 * Get basic market parameters (lightweight, for transactions)
 *
 * @param marketId - Market ID
 * @returns Market parameters (loanToken, collateralToken, oracle, irm, lltv)
 */
export async function getBasicMarketParams(marketId: string | bigint): Promise<{
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
}> {
  return Morpho.getBasicMarketParams(marketId);
}
