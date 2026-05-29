/**
 * Aave Position Service
 *
 * Hybrid service that combines indexer data with live RPC data for positions.
 * Uses indexer for position list and collateral data, RPC for live account data.
 */

import type { Address } from "viem";

import {
  AaveSpoke,
  type AaveSpokeUserAccountData,
  type AaveSpokeUserPosition,
} from "../clients";
import { hasDebtFromPosition } from "../utils";

import {
  fetchAaveActivePositionsWithCollaterals,
  type AavePosition,
  type AavePositionCollateral,
} from "./fetchPositions";

/**
 * Debt position data for a single reserve
 */
export interface DebtPosition {
  reserveId: bigint;
  drawnShares: bigint;
  premiumShares: bigint;
  totalDebt: bigint;
}

/**
 * Position with live on-chain data
 */
export interface AavePositionWithLiveData extends AavePosition {
  /** Collateral entries for this position */
  collaterals: AavePositionCollateral[];
  /** Live position data from Spoke */
  liveData: {
    /** Drawn debt shares */
    drawnShares: bigint;
    /** Premium shares (interest) */
    premiumShares: bigint;
    /** Supplied collateral shares */
    suppliedShares: bigint;
    /** Whether position has any debt */
    hasDebt: boolean;
    /**
     * Dynamic config key stored on the user's position.
     *
     * This is the key the contract's liquidation path actually uses
     * (`collateralUserPosition.dynamicConfigKey`). It is copied from
     * `reserve.dynamicConfigKey` when the position is opened/refreshed and
     * then insulated from later reserve-config rotations. Downstream split
     * math must prefer this over the reserve's current key whenever the
     * user already has a position.
     */
    dynamicConfigKey: number;
  };
  /**
   * Live account data from Spoke (calculated using on-chain oracle prices)
   * This is the authoritative data for health factor and values.
   */
  accountData: AaveSpokeUserAccountData;
  /**
   * Debt positions across borrowable reserves (only populated if borrowableReserveIds provided)
   * Map of reserveId to debt position data (only includes reserves with debt)
   */
  debtPositions?: Map<bigint, DebtPosition>;
}

/**
 * Options for getUserPositionsWithLiveData
 */
export interface GetUserPositionsOptions {
  /**
   * Optional array of borrowable reserve IDs to check for debt positions.
   * If provided, debt positions will be fetched in the same call and included in the result.
   * This avoids a separate RPC call when both position and debt data are needed.
   */
  borrowableReserveIds?: bigint[];
  /**
   * vBTC reserve ID on Core Spoke (from config: vaultBtcReserveId).
   * Required for fetching collateral position data from Spoke.
   */
  vbtcReserveId: bigint;
}

/**
 * Get user positions with live on-chain data
 *
 * Fetches positions with collaterals from indexer (single GraphQL call)
 * and enriches with live data from Spoke.
 *
 * Note: In Babylon vault integration, users can only have ONE position
 * (single vBTC collateral reserve), so the vBTC collateral read stays a
 * single-shot `getUserPosition`. Debt discovery across borrowable reserves
 * uses two batched multicalls (see `fetchDebtPositionsForReserves`).
 *
 * **WARNING: This is a heavy method that makes multiple RPC calls:**
 * - 1 GraphQL call (indexer)
 * - 1 RPC call for collateral position (getUserPosition)
 * - 1 RPC call for account data (getUserAccountData)
 * - 1 multicall for debt-reserve probe (covers all borrowableReserveIds)
 * - 1 multicall for total-debt readout (only if any reserve carries debt)
 *
 * Use sparingly and cache results appropriately (e.g., with React Query).
 * Avoid calling this method multiple times for the same user in a single render.
 *
 * @param depositor - User's Ethereum address
 * @param spokeAddress - Spoke contract address (from config context)
 * @param options - Parameters including vbtcReserveId and optional borrowableReserveIds
 * @returns Array of positions with live data (0 or 1 position)
 */
export async function getUserPositionsWithLiveData(
  depositor: string,
  spokeAddress: Address,
  options: GetUserPositionsOptions,
): Promise<AavePositionWithLiveData[]> {
  const { borrowableReserveIds, vbtcReserveId } = options;

  // Fetch active positions with collaterals in a single GraphQL call
  const positions = await fetchAaveActivePositionsWithCollaterals(depositor);

  if (positions.length === 0) {
    return [];
  }

  // User can only have one position in Babylon vault integration
  const position = positions[0];
  const proxyAddress = position.proxyContract as Address;

  // Fetch live data from Spoke in parallel
  const [spokePosition, accountData] = await Promise.all([
    AaveSpoke.getUserPosition(spokeAddress, vbtcReserveId, proxyAddress),
    AaveSpoke.getUserAccountData(spokeAddress, proxyAddress),
  ]);

  let debtPositions: Map<bigint, DebtPosition> | undefined;
  if (accountData.borrowCount > 0n) {
    // Fail closed: a stale or skipped reserve list would otherwise let
    // a debt reserve drop out of the repay picker.
    if (!borrowableReserveIds || borrowableReserveIds.length === 0) {
      throw new Error(
        `Aave debt reserve discovery: on-chain reports ${accountData.borrowCount} debt reserve(s) but no reserve IDs were provided to probe.`,
      );
    }
    debtPositions = await fetchDebtPositionsForReserves(
      proxyAddress,
      spokeAddress,
      borrowableReserveIds,
    );
    if (BigInt(debtPositions.size) < accountData.borrowCount) {
      throw new Error(
        `Aave debt reserve discovery: on-chain reports ${accountData.borrowCount} debt reserve(s), found ${debtPositions.size}. The reserve list is likely incomplete.`,
      );
    }
  }

  return [
    {
      ...position,
      liveData: {
        drawnShares: spokePosition.drawnShares,
        premiumShares: spokePosition.premiumShares,
        suppliedShares: spokePosition.suppliedShares,
        hasDebt: hasDebtFromPosition(spokePosition),
        dynamicConfigKey: spokePosition.dynamicConfigKey,
      },
      accountData,
      debtPositions,
    },
  ];
}

/**
 * Internal helper to fetch debt positions for multiple reserves.
 *
 * Uses two multicalls: one over every reserve's `getUserPosition` (per-reserve
 * soft-fail preserved via `allowFailure: true` inside `getUserPositionsBatch`),
 * then a second `getUserTotalDebt` only for the reserves that actually carry
 * debt (hard-fail).
 */
async function fetchDebtPositionsForReserves(
  proxyAddress: Address,
  spokeAddress: Address,
  reserveIds: bigint[],
): Promise<Map<bigint, DebtPosition>> {
  const results = new Map<bigint, DebtPosition>();
  if (reserveIds.length === 0) return results;

  const positions = await AaveSpoke.getUserPositionsBatch(
    spokeAddress,
    reserveIds,
    proxyAddress,
  );

  const reservesWithDebt: {
    reserveId: bigint;
    position: AaveSpokeUserPosition;
  }[] = [];
  positions.forEach((position, idx) => {
    if (position && hasDebtFromPosition(position)) {
      reservesWithDebt.push({ reserveId: reserveIds[idx], position });
    }
  });

  if (reservesWithDebt.length === 0) return results;

  const totalDebts = await AaveSpoke.getUserTotalDebtsBatch(
    spokeAddress,
    reservesWithDebt.map((r) => r.reserveId),
    proxyAddress,
  );

  reservesWithDebt.forEach(({ reserveId, position }, idx) => {
    results.set(reserveId, {
      reserveId,
      drawnShares: position.drawnShares,
      premiumShares: position.premiumShares,
      totalDebt: totalDebts[idx],
    });
  });

  return results;
}
