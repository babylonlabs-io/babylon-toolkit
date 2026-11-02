/**
 * Hook for fetching user's Aave position data
 *
 * Fetches the user's active Aave position with live on-chain data.
 * Uses Aave's on-chain oracle prices for authoritative health factor and values.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";

import { satoshiToBtcNumber } from "@/utils/btcConversion";
import {
  AAVE_USER_POSITION_FAILING_READ_QUERY_KEY,
  AAVE_USER_POSITION_QUERY_KEY,
} from "@/utils/queryKeys";

import {
  POSITION_FAILING_MIN_ATTEMPTS,
  POSITION_REFETCH_INTERVAL_MS,
  POSITION_STALENESS_THRESHOLD_MS,
} from "../constants";
import { useAaveConfig } from "../context";
import {
  getUserPositionsWithLiveData,
  type AavePositionWithLiveData,
} from "../services";
import {
  aaveRayValueToUsd,
  aaveValueToUsd,
  getHealthFactorStatus,
  wadToNumber,
  type HealthFactorStatus,
} from "../utils";

// Re-export for consumers
export type { HealthFactorStatus };

/**
 * Result interface for useAaveUserPosition hook
 *
 * Note: In the Babylon vault integration, users can only have ONE position
 * because there's only one collateral reserve (vaultBTC). The position is
 * keyed by the user's depositor address.
 */
export interface UseAaveUserPositionResult {
  /** User's vBTC collateral position (null if no position) */
  position: AavePositionWithLiveData | null;
  /** Collateral amount in BTC (from the on-chain adapter) */
  collateralBtc: number;
  /** Total collateral value in USD (from Aave oracle) */
  collateralValueUsd: number;
  /** Total debt value in USD (from Aave oracle) */
  debtValueUsd: number;
  /** Health factor as a number (1.0 = liquidation threshold, from Aave) */
  healthFactor: number | null;
  /** Health factor status for UI display */
  healthFactorStatus: HealthFactorStatus;
  /**
   * True when position data may be stale (last successful fetch
   * exceeded the staleness threshold). Indicates oracle-derived
   * values (health factor, collateral/debt USD) may be outdated.
   * This is a UI-level warning — on-chain Aave has its own oracle
   * staleness protections for liquidation decisions.
   */
  isPositionDataStale: boolean;
  /**
   * True when the position can't be trusted for risk display: reads are failing,
   * and there is nothing cached or the last success is past the staleness
   * threshold. Holds until a read succeeds.
   *
   * Neither `error` nor `isPositionDataStale` can drive a warning that must not
   * blink. With nothing cached, every poll resets `error` to null and `isLoading`
   * to true for its retries. With a cached read, `error` stays null until a
   * fetch's retries run out, and `isPositionDataStale` reads false during each
   * refetch. Age alone would flash this on a healthy tab refetching after being
   * hidden, so it also needs reads to be failing; a read that stalls without ever
   * failing does not trip it.
   */
  isPositionUnavailable: boolean;
  /**
   * When the account data `healthFactor` comes from was received (ms since
   * epoch), or null without a position. It dates the health factor itself,
   * not the debt reads that complete the position query after it, and does
   * not change while a refetch is in flight.
   */
  healthFactorReceivedAt: number | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch function — returns fresh position data (or null if unavailable) */
  refetch: () => Promise<AavePositionWithLiveData | null>;
}

/**
 * Hook to fetch user's Aave position with live data
 *
 * Values are sourced from Aave's on-chain oracle prices, making them
 * authoritative for liquidation decisions.
 *
 * Also fetches debt positions for all borrowable reserves in the same call,
 * avoiding separate RPC calls when displaying borrowed assets.
 */
export function useAaveUserPosition(
  connectedAddress: string | undefined,
): UseAaveUserPositionResult {
  const { config, allBorrowReserves } = useAaveConfig();
  const spokeAddress = config?.coreSpokeAddress;
  const vbtcReserveId = config?.vaultBtcReserveId;

  // Query debt positions across all non-vBTC reserves, not just currently
  // borrowable ones. A user may carry debt in a reserve that has since been
  // frozen/paused/un-borrowable, and that debt must still surface here.
  const borrowableReserveIds = useMemo(
    () => allBorrowReserves.map((r) => r.reserveId),
    [allBorrowReserves],
  );

  // Convert BigInt to string for React Query key serialization
  const borrowableReserveIdsKey = useMemo(
    () => borrowableReserveIds.map((id) => id.toString()),
    [borrowableReserveIds],
  );

  const {
    data: positions,
    isLoading: positionsLoading,
    error: positionsError,
    errorUpdatedAt,
    failureCount,
    dataUpdatedAt,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: [
      AAVE_USER_POSITION_QUERY_KEY,
      connectedAddress,
      spokeAddress,
      vbtcReserveId?.toString(),
      borrowableReserveIdsKey,
    ],
    queryFn: () =>
      getUserPositionsWithLiveData(connectedAddress!, spokeAddress!, {
        borrowableReserveIds,
        vbtcReserveId: vbtcReserveId!,
      }),
    enabled: !!connectedAddress && !!spokeAddress && vbtcReserveId != null,
    refetchOnMount: true,
    // A phone returning from the wallet app must not show the pre-tx position.
    refetchOnWindowFocus: "always",
    refetchInterval: POSITION_REFETCH_INTERVAL_MS,
    // `"online"` (the default) pauses queries when `navigator.onLine` is
    // false rather than running queryFn — `refetch()` then resolves with
    // stale data and `isError` never flips. `"always"` lets real network
    // failures surface through `isError`, which the repay submit path
    // relies on to fail loudly instead of using stale debt values.
    networkMode: "always",
  });

  // Track staleness: re-evaluate when dataUpdatedAt changes or on a timer
  const [isPositionDataStale, setIsPositionDataStale] = useState(false);
  const stalenessTimerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    // No data fetched yet — not stale (just loading)
    if (dataUpdatedAt === 0) {
      setIsPositionDataStale(false);
      return;
    }

    const checkStaleness = () => {
      const age = Date.now() - dataUpdatedAt;
      setIsPositionDataStale(
        !isFetching && age > POSITION_STALENESS_THRESHOLD_MS,
      );
    };

    checkStaleness();

    // Re-check at the refetch interval so the flag updates even if
    // the component doesn't re-render from new data
    stalenessTimerRef.current = setInterval(
      checkStaleness,
      POSITION_REFETCH_INTERVAL_MS,
    );

    return () => {
      clearInterval(stalenessTimerRef.current);
    };
  }, [dataUpdatedAt, isFetching]);

  // Read at render, unlike `isPositionDataStale`: it keeps counting through a
  // refetch, is right on the first render after a mount, and catches up on the
  // next render after timers were suspended. The timer only forces the render
  // that notices a read crossing the threshold between polls; the extra
  // millisecond is because the comparison is strict.
  const [, forceRender] = useReducer((renders: number) => renders + 1, 0);
  const isPastStalenessThreshold =
    dataUpdatedAt !== 0 &&
    Date.now() - dataUpdatedAt > POSITION_STALENESS_THRESHOLD_MS;

  useEffect(() => {
    if (dataUpdatedAt === 0) return;

    const msUntilStale =
      POSITION_STALENESS_THRESHOLD_MS - (Date.now() - dataUpdatedAt);
    if (msUntilStale < 0) return;

    const timer = setTimeout(forceRender, msUntilStale + 1);
    return () => {
      clearTimeout(timer);
    };
  }, [dataUpdatedAt]);

  // A fetch that ran out of retries since the last success. Query-level, so it
  // holds through later polls and restarts and for a component mounting after it.
  const hasFailedFetch = errorUpdatedAt > dataUpdatedAt;
  const isOnFailingRetries = failureCount >= POSITION_FAILING_MIN_ATTEMPTS;

  // A restarted fetch (`refetch`, `invalidateQueries`) zeroes `failureCount`, and
  // `error` is still null if no fetch has run out of retries yet, so the failure
  // is remembered against the cached read it happened to. In the query cache, not
  // this component, so a hook mounted later reads it on its first render; that
  // first render also sees a `failureCount` of 0. A success moves `dataUpdatedAt`,
  // and a query with no data has nothing to restart.
  const queryClient = useQueryClient();
  const failingReadQueryKey = useMemo(
    () => [
      AAVE_USER_POSITION_FAILING_READ_QUERY_KEY,
      connectedAddress,
      spokeAddress,
      vbtcReserveId?.toString(),
      borrowableReserveIdsKey,
    ],
    [connectedAddress, spokeAddress, vbtcReserveId, borrowableReserveIdsKey],
  );

  useEffect(() => {
    if (isOnFailingRetries && dataUpdatedAt !== 0) {
      // A write doesn't re-arm an entry's collection timer, so the default
      // gcTime would forget this 5 minutes after the first write, mid-outage.
      queryClient.setQueryDefaults(failingReadQueryKey, { gcTime: Infinity });
      queryClient.setQueryData(failingReadQueryKey, dataUpdatedAt);
    }
  }, [queryClient, failingReadQueryKey, isOnFailingRetries, dataUpdatedAt]);

  const failingReadAt = queryClient.getQueryData<number>(failingReadQueryKey);
  const areReadsFailing =
    hasFailedFetch || isOnFailingRetries || failingReadAt === dataUpdatedAt;
  const isPositionUnavailable =
    areReadsFailing && (dataUpdatedAt === 0 || isPastStalenessThreshold);

  // User can only have one position (single vBTC collateral reserve)
  const position = positions?.[0] ?? null;

  // Derive values from position's account data (uses Aave oracle prices)
  const { collateralBtc, collateralValueUsd, debtValueUsd, healthFactor } =
    useMemo(() => {
      if (!position) {
        return {
          collateralBtc: 0,
          collateralValueUsd: 0,
          debtValueUsd: 0,
          healthFactor: null,
        };
      }

      const { accountData, totalCollateral } = position;

      return {
        collateralBtc: satoshiToBtcNumber(totalCollateral),
        collateralValueUsd: aaveValueToUsd(accountData.totalCollateralValue),
        debtValueUsd: aaveRayValueToUsd(accountData.totalDebtValueRay),
        healthFactor:
          accountData.totalDebtValueRay > 0n
            ? wadToNumber(accountData.healthFactor)
            : null,
      };
    }, [position]);

  const healthFactorStatus = getHealthFactorStatus(
    healthFactor,
    debtValueUsd > 0,
  );

  return {
    position,
    collateralBtc,
    collateralValueUsd,
    debtValueUsd,
    healthFactor,
    healthFactorStatus,
    isPositionDataStale,
    isPositionUnavailable,
    healthFactorReceivedAt: position?.accountDataReceivedAt ?? null,
    isLoading: positionsLoading,
    error: positionsError as Error | null,
    refetch: async () => {
      const result = await refetch();
      if (result.isError) {
        throw result.error ?? new Error("Failed to refetch position data");
      }
      return result.data?.[0] ?? null;
    },
  };
}
