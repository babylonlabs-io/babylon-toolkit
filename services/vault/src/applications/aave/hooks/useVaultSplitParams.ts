/**
 * Hook for fetching vault split parameters from the Core Spoke contract.
 *
 * Fetches THF from getTargetHealthFactor and CF/LB from getDynamicReserveConfig,
 * converting them from on-chain formats (WAD/BPS) to plain numbers for use
 * in split calculations.
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

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

import { AaveSpoke } from "../clients";
import {
  BPS_SCALE,
  CONFIG_RETRY_COUNT,
  CONFIG_STALE_TIME_MS,
} from "../constants";
import { useAaveConfig } from "../context";
import { wadToNumber } from "../utils";

import { useAaveUserPosition } from "./useAaveUserPosition";

export interface VaultSplitParams {
  /** Target health factor (e.g. 1.10) */
  THF: number;
  /** Collateral factor (e.g. 0.75) */
  CF: number;
  /** Liquidation bonus (e.g. 1.05) */
  LB: number;
}

export interface UseVaultSplitParamsResult {
  /** Split params, or null while loading/errored */
  params: VaultSplitParams | null;
  isLoading: boolean;
  error: Error | null;
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

  const [thfWad, dynamicConfig] = await Promise.all([
    AaveSpoke.getTargetHealthFactor(spokeAddress),
    AaveSpoke.getDynamicReserveConfig(
      spokeAddress,
      reserveId,
      dynamicConfigKey,
    ),
  ]);

  return {
    THF: wadToNumber(thfWad),
    CF: Number(dynamicConfig.collateralFactor) / BPS_SCALE,
    LB: Number(dynamicConfig.maxLiquidationBonus) / BPS_SCALE,
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
  const reserveId = config?.btcVaultCoreVbtcReserveId;

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

  const { data, isLoading, error } = useQuery({
    queryKey: [
      "vaultSplitParams",
      spokeAddress,
      reserveId?.toString(),
      positionDynamicConfigKey,
    ],
    queryFn: () =>
      fetchSplitParams(spokeAddress!, reserveId!, positionDynamicConfigKey),
    enabled: !!spokeAddress && reserveId != null && isPositionResolved,
    staleTime: CONFIG_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    retry: CONFIG_RETRY_COUNT,
  });

  return {
    params: data ?? null,
    isLoading: isLoading || (!!connectedAddress && positionLoading),
    error: error as Error | null,
  };
}
