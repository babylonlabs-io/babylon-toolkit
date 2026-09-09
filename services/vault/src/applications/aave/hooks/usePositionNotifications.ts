import { useMemo } from "react";

import { COPY } from "@/copy";
import { useDashboardState } from "@/hooks/useDashboardState";
import { usePrices } from "@/hooks/usePrices";

import {
  calculate,
  type CalculatorParams,
  type CalculatorResult,
  type Vault,
  type Warning,
} from "../positionNotifications";
import type { ReorderVerificationContext } from "../services";

import { useVaultSplitParams } from "./useVaultSplitParams";

export type PositionNotificationsStatus =
  | "loading"
  | "no-wallet"
  | "no-vaults"
  | "incomplete-position"
  | "no-price"
  | "stale-price"
  | "ready";

export interface UsePositionNotificationsResult {
  result: CalculatorResult | null;
  liveUrgentWarning: Warning | null;
  status: PositionNotificationsStatus;
  isLoading: boolean;
  /**
   * Trusted calculator inputs to pass into the reorder signing guard so the
   * optimizer can be re-run against on-chain amounts before the wallet
   * prompt fires. Non-null only when `status === "ready"`.
   */
  reorderVerificationContext: ReorderVerificationContext | null;
  /**
   * The exact params `result` was computed from. Non-null only when
   * `status === "ready"`. Lets what-if consumers (the liquidation
   * dashboard's price simulator) re-run the pure `calculate()` with an
   * overridden `btcPrice` without touching this live path.
   */
  params: CalculatorParams | null;
}

/**
 * Health-factor threshold at which the live-HF guardrail forces an
 * `urgent` warning into the calculator result.
 *
 * Aligned with the calculator's own `URGENT_DISTANCE_PCT = 5%` rule —
 * a position whose live oracle health factor sits at or below 1.05 is
 * within the same band the calculator already considers urgent, so we
 * surface the warning even when stale indexed data inflated `totalBtc`
 * enough to suppress it.
 */
const LIVE_HF_URGENT_THRESHOLD = 1.05;

function buildLiveHfUrgentWarning(healthFactor: number): Warning {
  return {
    type: "urgent",
    title: COPY.liquidationWarnings.liveHealthFactor.title(
      healthFactor.toFixed(2),
    ),
    detail: COPY.liquidationWarnings.liveHealthFactor.detail,
    suggestion: COPY.liquidationWarnings.urgent.approachingSuggestion,
  };
}

export function usePositionNotifications(
  connectedAddress: string | undefined,
): UsePositionNotificationsResult {
  const { params: splitParams, isLoading: paramsLoading } =
    useVaultSplitParams(connectedAddress);

  const {
    collateralVaults,
    debtValueUsd,
    healthFactor,
    indexerError,
    isLoading: dashboardLoading,
  } = useDashboardState(connectedAddress);

  const { prices, metadata } = usePrices();
  const btcPrice = prices["BTC"] ?? 0;
  const btcMetadata = metadata["BTC"];

  const isLoading = paramsLoading || dashboardLoading;
  const liveUrgentWarning = useMemo(
    () =>
      connectedAddress &&
      !dashboardLoading &&
      debtValueUsd > 0 &&
      healthFactor !== null &&
      healthFactor <= LIVE_HF_URGENT_THRESHOLD
        ? buildLiveHfUrgentWarning(healthFactor)
        : null,
    [connectedAddress, dashboardLoading, debtValueUsd, healthFactor],
  );

  const { result, status, reorderVerificationContext, params } = useMemo((): {
    result: CalculatorResult | null;
    status: PositionNotificationsStatus;
    reorderVerificationContext: ReorderVerificationContext | null;
    params: CalculatorParams | null;
  } => {
    if (!splitParams || isLoading)
      return {
        result: null,
        status: "loading",
        reorderVerificationContext: null,
        params: null,
      };
    if (!connectedAddress)
      return {
        result: null,
        status: "no-wallet",
        reorderVerificationContext: null,
        params: null,
      };
    if (indexerError)
      return {
        result: null,
        status: "incomplete-position",
        reorderVerificationContext: null,
        params: null,
      };
    if (btcMetadata?.isStale || btcMetadata?.fetchFailed)
      return {
        result: null,
        status: "stale-price",
        reorderVerificationContext: null,
        params: null,
      };
    if (!btcMetadata || btcPrice <= 0)
      return {
        result: null,
        status: "no-price",
        reorderVerificationContext: null,
        params: null,
      };
    // Optimistic activating rows carry collateral the contract has not seen
    // yet, and a sentinel `liquidationIndex`. Including them would inflate
    // `totalBtc`, pushing every liquidation price DOWN — understating the
    // risk — and label a band "Vault 9007199254740992". The cascade models
    // what the protocol would seize, so it sees indexed vaults only.
    const indexedVaults = collateralVaults.filter(
      (entry) => !entry.isActivating,
    );
    if (indexedVaults.length === 0)
      return {
        result: null,
        status: "no-vaults",
        reorderVerificationContext: null,
        params: null,
      };

    const vaults: Vault[] = indexedVaults.map((entry) => ({
      id: entry.vaultId,
      btc: entry.amountBtc,
      name: `Vault ${entry.liquidationIndex + 1}`,
    }));

    const calculatorParams: CalculatorParams = {
      btcPrice,
      totalDebtUsd: debtValueUsd,
      vaults,
      CF: splitParams.CF,
      THF: splitParams.THF,
      maxLB: splitParams.LB,
    };

    const calculatorResult = calculate(calculatorParams);

    // Live-HF urgency guardrail. Even when the calculator's own
    // distance check did not surface urgent (e.g. because stale indexed
    // rows inflated `totalBtc`), force one based on the on-chain
    // oracle's health factor. Trigger window aligns with the
    // calculator's `URGENT_DISTANCE_PCT`. No duplicate if the
    // calculator already produced an `urgent` warning.
    const hasUrgent = calculatorResult.warnings.some(
      (w) => w.type === "urgent",
    );
    const resultWithLiveHf: CalculatorResult =
      !hasUrgent && liveUrgentWarning
        ? {
            ...calculatorResult,
            warnings: [liveUrgentWarning, ...calculatorResult.warnings],
          }
        : calculatorResult;

    return {
      result: resultWithLiveHf,
      status: "ready",
      reorderVerificationContext: {
        CF: splitParams.CF,
        THF: splitParams.THF,
        maxLB: splitParams.LB,
        btcPrice,
        totalDebtUsd: debtValueUsd,
      },
      params: calculatorParams,
    };
  }, [
    splitParams,
    isLoading,
    connectedAddress,
    btcPrice,
    btcMetadata,
    collateralVaults,
    debtValueUsd,
    indexerError,
    liveUrgentWarning,
  ]);

  return {
    result,
    liveUrgentWarning,
    status,
    isLoading,
    reorderVerificationContext,
    params,
  };
}
