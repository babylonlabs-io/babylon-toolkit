import { useMemo } from "react";

import { FeatureFlags } from "@/config";
import { COPY } from "@/copy";
import { useDashboardState } from "@/hooks/useDashboardState";
import { usePrices } from "@/hooks/usePrices";
import { useVaultCountCap } from "@/hooks/useVaultCountCap";

import {
  calculate,
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
    title: `Critical — health factor ${healthFactor.toFixed(2)}`,
    detail: `On-chain health factor is at or below ${LIVE_HF_URGENT_THRESHOLD.toFixed(2)}. The position can be liquidated at the current price.`,
    suggestion:
      "Add collateral or repay part of the debt to restore a safe health factor.",
  };
}

function buildMaxVaultsWarning(cap: number): Warning {
  return {
    type: "max-vaults",
    title: COPY.liquidationWarnings.maxVaults.title,
    detail: COPY.liquidationWarnings.maxVaults.detail(cap),
  };
}

export function usePositionNotifications(
  connectedAddress: string | undefined,
): UsePositionNotificationsResult {
  const { params: splitParams, isLoading: paramsLoading } =
    useVaultSplitParams(connectedAddress);

  // On-chain per-position BTC Vault cap. `max-vaults` is a value-protection
  // capacity fact, shown ALWAYS (independent of the liquidation-notifications
  // flag), while the cascade warnings below stay behind the flag.
  const { isAtCap, maxVaults } = useVaultCountCap(connectedAddress);
  const ffOn = FeatureFlags.isLiquidationNotificationsEnabled;

  const {
    collateralVaults,
    debtValueUsd,
    healthFactor,
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

    const calculatorResult = calculate({
      btcPrice,
      totalDebtUsd: debtValueUsd,
      vaults,
      CF: splitParams.CF,
      THF: splitParams.THF,
      maxLB: splitParams.LB,
    });

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
      !hasUrgent &&
      healthFactor !== null &&
      healthFactor <= LIVE_HF_URGENT_THRESHOLD
        ? {
            ...calculatorResult,
            warnings: [
              buildLiveHfUrgentWarning(healthFactor),
              ...calculatorResult.warnings,
            ],
          }
        : calculatorResult;

    // The cascade warnings (cliff / reorder / urgent / dust …) stay behind the
    // liquidation-notifications flag; when it's off we strip them so only a
    // possible max-vaults advisory remains.
    const cascadeResult: CalculatorResult = ffOn
      ? resultWithLiveHf
      : { ...resultWithLiveHf, warnings: [], optimalVaultOrder: null };

    // Max-vaults is a position-capacity fact, always-on and independent of the
    // liquidation cascade — injected here (not inside `calculate`, which
    // early-exits for zero-debt / dust positions) whenever the on-chain count is
    // at/over the cap. Mirrors the contract's `_validatePositionSizeBoundaries`.
    const finalResult: CalculatorResult =
      isAtCap && maxVaults != null
        ? {
            ...cascadeResult,
            warnings: [
              buildMaxVaultsWarning(maxVaults),
              ...cascadeResult.warnings,
            ],
          }
        : cascadeResult;

    return {
      result: finalResult,
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
    healthFactor,
    isAtCap,
    maxVaults,
    ffOn,
  ]);

  return { result, status, isLoading, reorderVerificationContext };
}
