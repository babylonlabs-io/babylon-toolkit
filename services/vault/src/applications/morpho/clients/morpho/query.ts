// Morpho Protocol - Read operations (queries)

import { formatUnits, type Address } from "viem";

import { ethClient } from "../../../../clients/eth-contract/client";
import { CONTRACTS } from "../../../../config/contracts";

import {
  ID_TO_MARKET_PARAMS_ABI,
  MARKET_ABI,
  POSITION_ABI,
} from "./abis/morpho";
import type { MorphoMarketSummary, MorphoUserPosition } from "./types";
import { normalizeMarketId } from "./utils";

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
export async function getBasicMarketParams(id: string | bigint): Promise<{
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
}> {
  try {
    const publicClient = ethClient.getPublicClient();

    // Normalize market ID to bytes32 hex format
    const marketId = normalizeMarketId(id);

    // Call idToMarketParams directly from contract
    const result = await publicClient.readContract({
      address: CONTRACTS.MORPHO,
      abi: ID_TO_MARKET_PARAMS_ABI,
      functionName: "idToMarketParams",
      args: [marketId],
    });

    // Check if market exists (loanToken should not be zero address)
    if (result.loanToken === "0x0000000000000000000000000000000000000000") {
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
      `Failed to fetch market params for ID ${id}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Get market data directly from Morpho contract (no IRM calls, no SDK)
 *
 * This fetches market information by calling the Morpho contract directly:
 * - Market parameters (tokens, oracle, IRM, LLTV) via idToMarketParams()
 * - Market state (total supply/borrow, shares, fees, last update) via market()
 * - Derived metrics (utilization %, LLTV %)
 *
 * Use this when:
 * - Working with custom IRM contracts that may not implement standard interface
 * - You want to avoid SDK overhead and IRM calls
 * - Displaying market information in the UI
 *
 * @param id - Market ID (hex string or bigint)
 * @returns Complete market data including state and metrics
 */
export async function getMarketWithData(
  id: string | bigint,
): Promise<MorphoMarketSummary> {
  const publicClient = ethClient.getPublicClient();

  // Normalize market ID to bytes32 hex format
  const marketId = normalizeMarketId(id);

  // Fetch market params and state in parallel (both from Morpho contract only)
  const [params, state] = await Promise.all([
    publicClient.readContract({
      address: CONTRACTS.MORPHO,
      abi: ID_TO_MARKET_PARAMS_ABI,
      functionName: "idToMarketParams",
      args: [marketId],
    }),
    publicClient.readContract({
      address: CONTRACTS.MORPHO,
      abi: MARKET_ABI,
      functionName: "market",
      args: [marketId],
    }),
  ]);

  // Check if market exists
  if (params.loanToken === "0x0000000000000000000000000000000000000000") {
    throw new Error(`Market does not exist for ID: ${id}`);
  }

  // Calculate derived values
  const totalSupply = state.totalSupplyAssets;
  const totalBorrow = state.totalBorrowAssets;
  const utilization =
    totalSupply > 0n ? Number((totalBorrow * 10000n) / totalSupply) / 100 : 0;
  const lltvPercent = Number(formatUnits(params.lltv, 16));

  return {
    id: typeof id === "bigint" ? id.toString() : id,
    loanToken: params.loanToken,
    collateralToken: params.collateralToken,
    oracle: params.oracle,
    lltv: params.lltv,
    totalSupplyAssets: state.totalSupplyAssets,
    totalSupplyShares: state.totalSupplyShares,
    totalBorrowAssets: state.totalBorrowAssets,
    totalBorrowShares: state.totalBorrowShares,
    lastUpdate: state.lastUpdate,
    fee: state.fee,
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
  userProxyContractAddress: Address,
): Promise<MorphoUserPosition> {
  const publicClient = ethClient.getPublicClient();

  // Normalize market ID to bytes32 hex format
  const marketIdHex = normalizeMarketId(marketId);

  // Fetch position and market state in parallel
  const [positionData, marketState] = await Promise.all([
    publicClient.readContract({
      address: CONTRACTS.MORPHO,
      abi: POSITION_ABI,
      functionName: "position",
      args: [marketIdHex, userProxyContractAddress],
    }),
    publicClient.readContract({
      address: CONTRACTS.MORPHO,
      abi: MARKET_ABI,
      functionName: "market",
      args: [marketIdHex],
    }),
  ]);

  // Destructure position tuple: [supplyShares, borrowShares, collateral]
  const [supplyShares, borrowShares, collateral] = positionData;

  // Calculate borrowAssets from shares using market state
  // Formula: borrowAssets = (borrowShares * totalBorrowAssets) / totalBorrowShares
  const borrowAssets =
    marketState.totalBorrowShares > 0n
      ? (borrowShares * marketState.totalBorrowAssets) /
        marketState.totalBorrowShares
      : 0n;

  return {
    marketId: typeof marketId === "bigint" ? marketId.toString() : marketId,
    user: userProxyContractAddress,
    supplyShares,
    borrowShares,
    borrowAssets, // Actual debt including accrued interest
    collateral,
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
  proxyContractAddresses: Address[],
): Promise<(MorphoUserPosition | undefined)[]> {
  if (proxyContractAddresses.length === 0) {
    return [];
  }

  const publicClient = ethClient.getPublicClient();

  // Normalize market ID to bytes32 hex format
  const marketIdHex = normalizeMarketId(marketId);

  // Fetch market state once (needed for borrowAssets calculation)
  const marketState = await publicClient.readContract({
    address: CONTRACTS.MORPHO,
    abi: MARKET_ABI,
    functionName: "market",
    args: [marketIdHex],
  });

  // Fetch all positions in parallel
  const results = await Promise.allSettled(
    proxyContractAddresses.map(async (proxyAddress) => {
      const positionData = await publicClient.readContract({
        address: CONTRACTS.MORPHO,
        abi: POSITION_ABI,
        functionName: "position",
        args: [marketIdHex, proxyAddress],
      });

      // Destructure position tuple: [supplyShares, borrowShares, collateral]
      const [supplyShares, borrowShares, collateral] = positionData;

      // Calculate borrowAssets from shares using market state
      const borrowAssets =
        marketState.totalBorrowShares > 0n
          ? (borrowShares * marketState.totalBorrowAssets) /
            marketState.totalBorrowShares
          : 0n;

      return {
        marketId: typeof marketId === "bigint" ? marketId.toString() : marketId,
        user: proxyAddress,
        supplyShares,
        borrowShares,
        borrowAssets,
        collateral,
      };
    }),
  );

  // Map results, returning undefined for failed fetches
  return results.map((result) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    // Position doesn't exist or error fetching
    return undefined;
  });
}
