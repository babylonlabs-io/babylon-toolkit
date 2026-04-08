import { useMemo } from "react";

import featureFlags from "@/config/featureFlags";
import { useDashboardState } from "@/hooks/useDashboardState";
import { usePrice } from "@/hooks/usePrices";

import {
  calculate,
  type CalculatorResult,
  type Vault,
} from "../positionNotifications";

import { useVaultSplitParams } from "./useVaultSplitParams";

export type PositionNotificationsStatus =
  | "flag-off"
  | "loading"
  | "no-wallet"
  | "no-vaults"
  | "no-price"
  | "ready";

export interface UsePositionNotificationsResult {
  result: CalculatorResult | null;
  status: PositionNotificationsStatus;
  isLoading: boolean;
}

export function usePositionNotifications(
  connectedAddress: string | undefined,
): UsePositionNotificationsResult {
  const { params: splitParams, isLoading: paramsLoading } =
    useVaultSplitParams();

  const {
    collateralVaults,
    debtValueUsd,
    isLoading: dashboardLoading,
  } = useDashboardState(connectedAddress);

  const btcPrice = usePrice("BTC");

  const isLoading = paramsLoading || dashboardLoading;

  const { result, status } = useMemo((): {
    result: CalculatorResult | null;
    status: PositionNotificationsStatus;
  } => {
    if (!featureFlags.isPositionNotificationsEnabled)
      return { result: null, status: "flag-off" };
    if (!splitParams || isLoading) return { result: null, status: "loading" };
    if (!connectedAddress) return { result: null, status: "no-wallet" };
    if (btcPrice <= 0) return { result: null, status: "no-price" };
    if (collateralVaults.length === 0)
      return { result: null, status: "no-vaults" };

    const vaults: Vault[] = collateralVaults.map((entry) => ({
      id: entry.vaultId,
      btc: entry.amountBtc,
      name: `Vault ${entry.liquidationIndex + 1}`,
    }));

    return {
      result: calculate({
        btcPrice,
        totalDebtUsd: debtValueUsd,
        vaults,
        CF: splitParams.CF,
        THF: splitParams.THF,
        maxLB: splitParams.LB,
      }),
      status: "ready",
    };
  }, [
    splitParams,
    isLoading,
    connectedAddress,
    btcPrice,
    collateralVaults,
    debtValueUsd,
  ]);

  return { result, status, isLoading };
}
