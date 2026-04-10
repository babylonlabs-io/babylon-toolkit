/**
 * Hook for fetching vault split parameters from the Core Spoke contract.
 *
 * Fetches THF from getLiquidationConfig and CF/LB from getDynamicReserveConfig,
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
 *   2. Otherwise, use `vbtcReserve.reserve.dynamicConfigKey` from the
 *      GraphQL indexer (the reserve's current key) — that is the value the
 *      contract will copy onto the user's position on their first borrow.
 *   3. Fall back to the contract's `getReserve` read if the indexer has no
 *      reserve data available yet.
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
  resolvedDynamicConfigKey: number | undefined,
): Promise<VaultSplitParams> {
  // Final fallback: ask the contract if neither the user's position nor the
  // indexer gave us a key.
  const dynamicConfigKey =
    resolvedDynamicConfigKey ??
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
 *   has no position yet, falls back to the reserve's current key.
 */
export function useVaultSplitParams(
  connectedAddress?: string,
): UseVaultSplitParamsResult {
  const { config, vbtcReserve } = useAaveConfig();
  const spokeAddress = config?.btcVaultCoreSpokeAddress as Address | undefined;
  const reserveId = config?.btcVaultCoreVbtcReserveId;

  // Reuses the cached query inside useAaveUserPosition — no duplicate RPCs.
  const { position, isLoading: positionLoading } =
    useAaveUserPosition(connectedAddress);

  // Prefer the position's stored key; otherwise use the reserve's current key.
  // Undefined here means "nothing known yet" and fetchSplitParams will do a
  // contract read as the final fallback.
  const resolvedDynamicConfigKey =
    position?.liveData.dynamicConfigKey ??
    vbtcReserve?.reserve.dynamicConfigKey;

  // While the position query is still loading for a connected user, defer
  // fetching split params so we don't briefly compute them with the reserve
  // key only to re-fetch a moment later with the position key.
  const isPositionResolved = !connectedAddress || !positionLoading;

  const { data, isLoading, error } = useQuery({
    queryKey: [
      "vaultSplitParams",
      spokeAddress,
      reserveId?.toString(),
      resolvedDynamicConfigKey,
    ],
    queryFn: () =>
      fetchSplitParams(spokeAddress!, reserveId!, resolvedDynamicConfigKey),
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
