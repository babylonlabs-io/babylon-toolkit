/**
 * Aave Position Service
 *
 * Hybrid service that combines indexer data with live RPC data for positions.
 * Uses indexer for position list and collateral data, RPC for live account data.
 */

import type { Address } from "viem";

import { AaveSpoke, type AaveSpokeUserAccountData } from "../clients";
import { hasDebtFromPosition } from "../utils";

import {
  fetchAaveActivePositionsWithCollaterals,
  fetchAavePositionByDepositor,
  fetchAavePositionCollaterals,
  type AavePosition,
  type AavePositionCollateral,
} from "./fetchPositions";

export class DebtPositionFetchError extends Error {
  readonly code = "DEBT_POSITION_FETCH_FAILED";
  readonly reserveId: bigint;

  constructor(reserveId: bigint, cause: unknown) {
    super(
      `Failed to fetch debt position for reserve ${reserveId}: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause },
    );
    this.name = "DebtPositionFetchError";
    this.reserveId = reserveId;
  }
}

export class IncompleteDebtDiscoveryError extends Error {
  readonly code = "INCOMPLETE_DEBT_DISCOVERY";
  readonly discovered: number;
  readonly expected: bigint;
  readonly queriedReserveIds: bigint[];

  constructor(
    discovered: number,
    expected: bigint,
    queriedReserveIds: bigint[],
  ) {
    super(
      `Discovered ${discovered} debt reserves but on-chain borrowCount is ${expected}. ` +
        `Aborting to prevent the repay UI from omitting unrepayable debt.`,
    );
    this.name = "IncompleteDebtDiscoveryError";
    this.discovered = discovered;
    this.expected = expected;
    this.queriedReserveIds = queriedReserveIds;
  }
}

export type DebtDiscoveryError =
  | DebtPositionFetchError
  | IncompleteDebtDiscoveryError;

export function isDebtDiscoveryError(
  error: unknown,
): error is DebtDiscoveryError {
  return (
    error instanceof DebtPositionFetchError ||
    error instanceof IncompleteDebtDiscoveryError
  );
}

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
   * vBTC reserve ID on Core Spoke (from config: btcVaultCoreVbtcReserveId).
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
 * (single vBTC collateral reserve), so we don't need batch calls.
 *
 * **WARNING: This is a heavy method that makes multiple RPC calls:**
 * - 1 GraphQL call (indexer)
 * - 1 RPC call for collateral position (getUserPosition)
 * - 1 RPC call for account data (getUserAccountData)
 * - N RPC calls for debt positions if borrowableReserveIds provided (one per reserve)
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
    if (!borrowableReserveIds || borrowableReserveIds.length === 0) {
      throw new IncompleteDebtDiscoveryError(0, accountData.borrowCount, []);
    }

    debtPositions = await fetchDebtPositionsForReserves(
      proxyAddress,
      spokeAddress,
      borrowableReserveIds,
    );

    // `<` not `!==`: surplus discovery (e.g. dust-only positions that
    // `hasDebtFromPosition` flags but `borrowCount` doesn't) is fine —
    // only a deficit can hide repayable debt from the UI.
    if (BigInt(debtPositions.size) < accountData.borrowCount) {
      throw new IncompleteDebtDiscoveryError(
        debtPositions.size,
        accountData.borrowCount,
        borrowableReserveIds,
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
 * Internal helper to fetch debt positions for multiple reserves
 */
async function fetchDebtPositionsForReserves(
  proxyAddress: Address,
  spokeAddress: Address,
  reserveIds: bigint[],
): Promise<Map<bigint, DebtPosition>> {
  const results = new Map<bigint, DebtPosition>();

  const positions = await Promise.all(
    reserveIds.map(async (reserveId) => {
      try {
        const position = await AaveSpoke.getUserPosition(
          spokeAddress,
          reserveId,
          proxyAddress,
        );
        return { reserveId, position };
      } catch (cause) {
        throw new DebtPositionFetchError(reserveId, cause);
      }
    }),
  );

  const reservesWithDebt = positions.filter(({ position }) =>
    hasDebtFromPosition(position),
  );

  const totalDebts = await Promise.all(
    reservesWithDebt.map(async ({ reserveId }) => {
      try {
        const totalDebt = await AaveSpoke.getUserTotalDebt(
          spokeAddress,
          reserveId,
          proxyAddress,
        );
        return { reserveId, totalDebt };
      } catch (cause) {
        throw new DebtPositionFetchError(reserveId, cause);
      }
    }),
  );

  const debtMap = new Map(totalDebts.map((d) => [d.reserveId, d.totalDebt]));

  for (const { reserveId, position } of reservesWithDebt) {
    results.set(reserveId, {
      reserveId,
      drawnShares: position.drawnShares,
      premiumShares: position.premiumShares,
      totalDebt: debtMap.get(reserveId) ?? 0n,
    });
  }

  return results;
}

/**
 * Get a single position with live data by depositor address
 *
 * @param depositorAddress - User's Ethereum address
 * @param spokeAddress - Spoke contract address (from config context)
 * @param vbtcReserveId - vBTC reserve ID (from config)
 * @returns Position with live data or null if not found
 */
export async function getPositionWithLiveData(
  depositorAddress: string,
  spokeAddress: Address,
  vbtcReserveId: bigint,
): Promise<AavePositionWithLiveData | null> {
  // Fetch position and collaterals from indexer in parallel
  const [position, collaterals] = await Promise.all([
    fetchAavePositionByDepositor(depositorAddress),
    fetchAavePositionCollaterals(depositorAddress),
  ]);

  if (!position) {
    return null;
  }

  const proxyAddress = position.proxyContract as Address;

  // Fetch live data from Spoke in parallel
  const [spokePosition, accountData] = await Promise.all([
    AaveSpoke.getUserPosition(spokeAddress, vbtcReserveId, proxyAddress),
    AaveSpoke.getUserAccountData(spokeAddress, proxyAddress),
  ]);

  return {
    ...position,
    collaterals,
    liveData: {
      drawnShares: spokePosition.drawnShares,
      premiumShares: spokePosition.premiumShares,
      suppliedShares: spokePosition.suppliedShares,
      hasDebt: hasDebtFromPosition(spokePosition),
      dynamicConfigKey: spokePosition.dynamicConfigKey,
    },
    accountData,
  };
}

/**
 * Check if a position can withdraw collateral
 *
 * Position can only withdraw if it has no debt.
 *
 * @param depositorAddress - User's Ethereum address
 * @param spokeAddress - Spoke contract address (from config context)
 * @param vbtcReserveId - vBTC reserve ID (from config)
 * @returns true if position can withdraw
 */
export async function canWithdrawCollateral(
  depositorAddress: string,
  spokeAddress: Address,
  vbtcReserveId: bigint,
): Promise<boolean> {
  const position = await getPositionWithLiveData(
    depositorAddress,
    spokeAddress,
    vbtcReserveId,
  );
  if (!position) {
    return false;
  }
  return !position.liveData.hasDebt;
}
