/**
 * Hook for the vault split parameters: the one set of inputs every split,
 * seizure and reorder calculation in the app uses.
 *
 * - CF and the max liquidation bonus come from the Core Spoke's
 *   `getDynamicReserveConfig`.
 * - LB is the liquidation bonus at the expected liquidation health factor,
 *   computed from the Spoke's bonus curve (`getLiquidationConfig`) and the
 *   max bonus, exactly as the contract computes it.
 * - THF and expectedHF are the SDK's `SPLIT_TARGET_HEALTH_FACTOR` and
 *   `EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION`. They are Babylon sizing
 *   constants, not Spoke reads: the Babylon Spoke never uses the Aave
 *   `targetHealthFactor`.
 *
 * **Which dynamicConfigKey do we use?**
 *
 * The contract's liquidation path reads the key stored on the user's
 * `UserPosition`, not the reserve's current key — that value is copied from
 * `reserve.dynamicConfigKey` when the position is opened/refreshed and then
 * insulated from later reserve rotations. So:
 *
 *   1. If the user already has a position, use
 *      `position.liveData.dynamicConfigKey` (authoritative for existing
 *      positions — matches what the contract will use during liquidation).
 *   2. Otherwise, call the contract's `getReserve` to read the reserve's
 *      current key — that is the value the contract will copy onto the
 *      user's position on their first borrow.
 *
 * The contract is the sole source of truth for this value; we deliberately
 * do not use the indexer-cached reserve config so there is no second,
 * potentially-stale source for a value that gates liquidation correctness.
 */

import {
  computeSplitLiquidationBonus,
  EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION,
  SPLIT_TARGET_HEALTH_FACTOR,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";

import { AaveSpoke } from "../clients";
import {
  BPS_SCALE,
  CONFIG_RETRY_COUNT,
  CONFIG_STALE_TIME_MS,
} from "../constants";
import { useAaveConfig } from "../context";

import { useAaveUserPosition } from "./useAaveUserPosition";

export interface VaultSplitParams {
  /** Split target health factor, `SPLIT_TARGET_HEALTH_FACTOR` (1.08) */
  THF: number;
  /** Expected health factor at liquidation, `EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION` (0.99) */
  expectedHF: number;
  /** Collateral factor (e.g. 0.78) */
  CF: number;
  /** Liquidation bonus at `expectedHF` (e.g. 1.0504). Used by all seizure math. */
  LB: number;
  /** Max liquidation bonus (e.g. 1.0555). Display only. */
  maxLB: number;
}

export interface UseVaultSplitParamsResult {
  /** Split params, or null while loading/errored */
  params: VaultSplitParams | null;
  isLoading: boolean;
  error: Error | null;
  /**
   * Force a fresh contract round-trip for `getDynamicReserveConfig` and
   * `getLiquidationConfig`. Use immediately before signing a borrow or
   * repay so the projected-HF math runs against current on-chain values
   * even when the cache is still within `staleTime` and the
   * `dynamicConfigKey` has not changed.
   *
   * Pre-sign callers should pass `retry: 0` so a transient RPC blip surfaces
   * fast instead of stalling the click for ~7s through the default retry
   * backoff. Background callers (none today) can omit and inherit
   * `CONFIG_RETRY_COUNT`.
   */
  refetch: (opts?: { retry?: number }) => Promise<VaultSplitParams | null>;
}

async function fetchSplitParams(
  spokeAddress: Address,
  reserveId: bigint,
  positionDynamicConfigKey: number | undefined,
): Promise<VaultSplitParams> {
  // If the user has a position, use its stored key. Otherwise ask the
  // contract for the reserve's current key (the value the contract will
  // copy onto the user's position on their first borrow).
  const dynamicConfigKey =
    positionDynamicConfigKey ??
    (await AaveSpoke.getReserve(spokeAddress, reserveId)).dynamicConfigKey;

  const [bonusConfig, dynamicConfig] = await Promise.all([
    AaveSpoke.getLiquidationBonusConfig(spokeAddress),
    AaveSpoke.getDynamicReserveConfig(
      spokeAddress,
      reserveId,
      dynamicConfigKey,
    ),
  ]);

  return {
    THF: SPLIT_TARGET_HEALTH_FACTOR,
    expectedHF: EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION,
    CF: dynamicConfig.collateralFactor / BPS_SCALE,
    // Same inputs the contract's liquidation uses: the curve from the Spoke's
    // liquidation config and the max bonus of the position's dynamic config.
    LB: computeSplitLiquidationBonus(
      bonusConfig,
      dynamicConfig.maxLiquidationBonus,
    ),
    maxLB: dynamicConfig.maxLiquidationBonus / BPS_SCALE,
  };
}

/**
 * @param connectedAddress - User's Ethereum address. When provided and the
 *   user has an existing position, the position's stored `dynamicConfigKey`
 *   is used (authoritative for liquidation math). When omitted or the user
 *   has no position yet, the reserve's current key is read from the
 *   contract via `getReserve`.
 */
export function useVaultSplitParams(
  connectedAddress?: string,
): UseVaultSplitParamsResult {
  const { config } = useAaveConfig();
  const spokeAddress = config?.coreSpokeAddress;
  const reserveId = config?.vaultBtcReserveId;

  // Reuses the cached query inside useAaveUserPosition — no duplicate RPCs.
  const { position, isLoading: positionLoading } =
    useAaveUserPosition(connectedAddress);

  // If the user has a position, use its stored key (authoritative for
  // liquidation math). Otherwise `fetchSplitParams` will call getReserve
  // on-chain to read the reserve's current key.
  const positionDynamicConfigKey = position?.liveData.dynamicConfigKey;

  // While the position query is still loading for a connected user, defer
  // fetching split params so we don't briefly compute them with the reserve
  // key only to re-fetch a moment later with the position key.
  const isPositionResolved = !connectedAddress || !positionLoading;

  const queryKey = [
    "vaultSplitParams",
    spokeAddress,
    reserveId?.toString(),
    positionDynamicConfigKey,
  ];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () =>
      fetchSplitParams(spokeAddress!, reserveId!, positionDynamicConfigKey),
    enabled: !!spokeAddress && reserveId != null && isPositionResolved,
    staleTime: CONFIG_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    retry: CONFIG_RETRY_COUNT,
  });

  const queryClient = useQueryClient();

  return {
    params: data ?? null,
    isLoading: isLoading || (!!connectedAddress && positionLoading),
    error: error as Error | null,
    // Use fetchQuery (not the useQuery refetch) so callers can pass
    // `retry: 0` and short-circuit the default retry backoff. Without this,
    // a pre-sign refetch on a transient RPC blip stalls the click for ~7s
    // through `CONFIG_RETRY_COUNT` retries before surfacing the error.
    // Both paths populate the same cache key, so the displayed value
    // updates regardless of which one ran.
    refetch: async (opts?: { retry?: number }) => {
      if (!spokeAddress || reserveId == null) return null;
      const result = await queryClient.fetchQuery({
        queryKey,
        queryFn: () =>
          fetchSplitParams(spokeAddress, reserveId, positionDynamicConfigKey),
        retry: opts?.retry ?? CONFIG_RETRY_COUNT,
        staleTime: 0, // force a fresh round-trip; this is the whole point
      });
      return result;
    },
  };
}
