import { useMemo } from "react";

import { useDashboardState } from "@/hooks/useDashboardState";
import { usePrices } from "@/hooks/usePrices";

import {
  calculate,
  type CalculatorResult,
  type Vault,
} from "../positionNotifications";
import type { ReorderVerificationContext } from "../services";

import { useVaultSplitParams } from "./useVaultSplitParams";

export type PositionNotificationsStatus =
  | "loading"
  | "no-wallet"
  | "no-vaults"
  | "no-price"
  | "stale-price"
  | "ready";

export interface UsePositionNotificationsResult {
  result: CalculatorResult | null;
  status: PositionNotificationsStatus;
  isLoading: boolean;
  /**
   * Trusted calculator inputs to pass into the reorder signing guard so the
   * optimizer can be re-run against on-chain amounts before the wallet
   * prompt fires. Non-null only when `status === "ready"`.
   */
  reorderVerificationContext: ReorderVerificationContext | null;
}

export function usePositionNotifications(
  connectedAddress: string | undefined,
): UsePositionNotificationsResult {
  const { params: splitParams, isLoading: paramsLoading } =
    useVaultSplitParams(connectedAddress);

  const {
    collateralVaults,
    debtValueUsd,
    isLoading: dashboardLoading,
  } = useDashboardState(connectedAddress);

  const { prices, metadata } = usePrices();
  const btcPrice = prices["BTC"] ?? 0;
  const btcMetadata = metadata["BTC"];

  const isLoading = paramsLoading || dashboardLoading;

  const { result, status, reorderVerificationContext } = useMemo((): {
    result: CalculatorResult | null;
    status: PositionNotificationsStatus;
    reorderVerificationContext: ReorderVerificationContext | null;
  } => {
    if (!splitParams || isLoading)
      return {
        result: null,
        status: "loading",
        reorderVerificationContext: null,
      };
    if (!connectedAddress)
      return {
        result: null,
        status: "no-wallet",
        reorderVerificationContext: null,
      };
    if (btcMetadata?.isStale || btcMetadata?.fetchFailed)
      return {
        result: null,
        status: "stale-price",
        reorderVerificationContext: null,
      };
    if (!btcMetadata || btcPrice <= 0)
      return {
        result: null,
        status: "no-price",
        reorderVerificationContext: null,
      };
    if (collateralVaults.length === 0)
      return {
        result: null,
        status: "no-vaults",
        reorderVerificationContext: null,
      };

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
      reorderVerificationContext: {
        CF: splitParams.CF,
        THF: splitParams.THF,
        maxLB: splitParams.LB,
        btcPrice,
        totalDebtUsd: debtValueUsd,
      },
    };
  }, [
    splitParams,
    isLoading,
    connectedAddress,
    btcPrice,
    btcMetadata,
    collateralVaults,
    debtValueUsd,
  ]);

  return { result, status, isLoading, reorderVerificationContext };
}
