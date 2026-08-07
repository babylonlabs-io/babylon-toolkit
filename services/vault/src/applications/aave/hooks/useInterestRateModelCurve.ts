/**
 * On-chain interest-rate-model curve for the selected reserve — the data
 * source for the C2 borrow-rate chart. Wraps `getInterestRateModelCurveSafe`
 * (three sequential multicalls: Hub totals, strategy shape, per-sample rates)
 * in a query so the card can render loading/error states like its sibling
 * Aave hooks.
 *
 * There is no "empty but successful" curve: a configured strategy always
 * yields the full sample set, so `curve === null` is the one empty state,
 * covering both the loading window and a Safe-result failure.
 *
 * Wallet-less: reads go through the app's public RPC client.
 */

import { useQuery } from "@tanstack/react-query";

import {
  getInterestRateModelCurveSafe,
  type IrmCurvePoint,
} from "../clients/aaveIrm";
import type { AaveReserveConfig } from "../services/fetchConfig";

const QUERY_KEY = "aaveIrmCurve";
const ONE_MINUTE_MS = 60 * 1000;

export interface UseInterestRateModelCurveResult {
  curve: IrmCurvePoint[] | null;
  kinkUtilizationPercent: number | null;
  currentUtilizationPercent: number | null;
  currentAprPercent: number | null;
  maxAprPercent: number | null;
  isLoading: boolean;
  error: Error | null;
}

export function useInterestRateModelCurve({
  reserve,
}: {
  reserve: AaveReserveConfig | null;
}): UseInterestRateModelCurveResult {
  const hubKey = reserve === null ? null : reserve.reserve.hub.toLowerCase();
  const assetId = reserve === null ? null : reserve.reserve.assetId;

  const { data, isLoading, error } = useQuery({
    queryKey: [QUERY_KEY, hubKey, assetId],
    queryFn: () =>
      getInterestRateModelCurveSafe({
        hub: reserve!.reserve.hub,
        assetId: reserve!.reserve.assetId,
      }),
    enabled: reserve !== null,
    staleTime: ONE_MINUTE_MS,
    refetchInterval: ONE_MINUTE_MS,
  });

  return {
    curve: data?.curve ?? null,
    kinkUtilizationPercent: data?.kinkUtilizationPercent ?? null,
    currentUtilizationPercent: data?.currentUtilizationPercent ?? null,
    currentAprPercent: data?.currentAprPercent ?? null,
    maxAprPercent: data?.maxAprPercent ?? null,
    isLoading: reserve !== null && isLoading,
    error: (error as Error | null) ?? data?.error ?? null,
  };
}
