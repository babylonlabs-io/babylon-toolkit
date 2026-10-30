import { HEALTH_FACTOR_LIQUIDATION_THRESHOLD } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { pegInConfigQueryOptions } from "@/context/ProtocolParamsContext";
import { COPY } from "@/copy";
import { useDashboardState } from "@/hooks/useDashboardState";
import { usePrices } from "@/hooks/usePrices";
import { satoshiToBtcNumber } from "@/utils/btcConversion";

import {
  calculate,
  type CalculatorParams,
  type CalculatorResult,
  type Vault,
  type Warning,
} from "../positionNotifications";
import type { ReorderVerificationContext } from "../services";
import { formatHealthFactor } from "../utils";

import { useVaultSplitParams } from "./useVaultSplitParams";

export type PositionNotificationsStatus =
  | "loading"
  | "no-wallet"
  | "no-vaults"
  | "incomplete-position"
  | "no-price"
  | "stale-price"
  /** The Spoke risk-parameter read failed; nothing can be calculated. */
  | "params-unavailable"
  | "ready";

export interface UsePositionNotificationsResult {
  result: CalculatorResult | null;
  /**
   * Urgent warning from the Spoke's live health factor, computed even when
   * `result` is null. When it is the urgent warning in `result.warnings` it
   * is this same object, not a copy: the top banner compares by reference to
   * tell that the live health factor, not the calculator, made it red.
   */
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
 * surface the warning even when the calculator's inputs suppress it. The
 * calculator prices the position from the dApp's own BTC feed, indexed vault
 * amounts and cached risk parameters, while the Spoke prices it from its own
 * oracle, so the two can disagree.
 */
const LIVE_HF_URGENT_THRESHOLD = 1.05;

function buildLiveHfUrgentWarning(healthFactor: number): Warning {
  return {
    type: "urgent",
    title: COPY.liquidationWarnings.liveHealthFactor.title(
      formatHealthFactor(healthFactor),
    ),
    detail: COPY.liquidationWarnings.liveHealthFactor.detail,
    suggestion: COPY.liquidationWarnings.urgent.approachingSuggestion,
  };
}

export function usePositionNotifications(
  connectedAddress: string | undefined,
): UsePositionNotificationsResult {
  const {
    params: splitParams,
    isLoading: paramsLoading,
    error: splitParamsError,
  } = useVaultSplitParams(connectedAddress);

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

  // Suggested vault sizes must be depositable, so the calculator needs the
  // protocol's minimum peg-in. Same cached query the deposit form reads. It
  // only sizes suggestions: the warnings wait for the read to settle (so the
  // suggested amount does not change once the minimum arrives), and if it
  // failed they render with the suggestions not floored.
  const { data: pegInConfig, isLoading: pegInConfigLoading } = useQuery(
    pegInConfigQueryOptions(),
  );

  const isLoading = paramsLoading || dashboardLoading || pegInConfigLoading;
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
    if (isLoading)
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
    // Optimistic activating rows carry collateral the contract has not seen
    // yet, and a sentinel `liquidationIndex`. Including them would inflate
    // `totalBtc`, pushing every liquidation price DOWN — understating the
    // risk — and label a band "Vault 9007199254740992". A withdrawing vault
    // has left the position and would inflate it the same way. The cascade
    // models what the protocol would seize, so it sees active vaults only.
    const indexedVaults = collateralVaults.filter(
      (entry) => entry.lifecycle === "active",
    );
    if (indexedVaults.length === 0)
      return {
        result: null,
        status: "no-vaults",
        reorderVerificationContext: null,
        params: null,
      };
    // Price problems are reported only once there is a position to price, so a
    // depositor without active vaults is not warned about notifications they
    // have nothing to receive.
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
    // Reported only once there is a position to warn about, and only for a
    // settled failure: the query does not refetch on focus, so the warnings
    // would otherwise be hidden for good with nothing said.
    // `computeSplitLiquidationBonus` throws on an out-of-range bonus curve,
    // so this is a reachable state.
    if (!splitParams)
      return {
        result: null,
        status: splitParamsError ? "params-unavailable" : "loading",
        reorderVerificationContext: null,
        params: null,
      };
    // A null `LB` is the same situation as a failed read for the warnings:
    // every seizure figure below is computed from it, so there is nothing to
    // show. The collateral factor survives in the same query on purpose, for
    // the borrow and repay pre-sign checks. Keyed on the value itself, not on
    // the reason string, so an empty reason cannot strand this on "loading".
    if (splitParams.LB === null)
      return {
        result: null,
        status: "params-unavailable",
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
      LB: splitParams.LB,
      expectedHF: splitParams.expectedHF,
      minPeginBtc: pegInConfig
        ? satoshiToBtcNumber(pegInConfig.minimumPegInAmount)
        : null,
    };

    const calculatorResult = calculate(calculatorParams);

    // Live-HF urgency guardrail. At most one urgent warning is shown, and it
    // never shows a buffer once the Spoke's health factor allows liquidation:
    // - the calculator has no urgent warning: the live one is added;
    // - the calculator still shows a buffer ("approaching") while the Spoke
    //   can already liquidate: the live one takes its place, rather than
    //   sitting under it as a secondary that contradicts it;
    // - otherwise the calculator's warning stays, since it names the
    //   liquidation price. While both sit in the urgent band above 1.0, its
    //   distance can still exceed the Spoke's, by less than the calculator's
    //   `URGENT_DISTANCE_PCT`.
    // The live warning goes in as the returned `liveUrgentWarning` object
    // itself, never a copy: the top banner compares by reference.
    const calculatorUrgent = calculatorResult.warnings.find(
      (w) => w.type === "urgent",
    );
    const firstGroup = calculatorResult.groups[0];
    // A negative distance is the calculator's "approaching" case.
    const calculatorShowsBuffer =
      firstGroup !== undefined && firstGroup.distancePct < 0;
    const isLiveHfLiquidatable =
      healthFactor !== null &&
      healthFactor < HEALTH_FACTOR_LIQUIDATION_THRESHOLD;
    const resultWithLiveHf: CalculatorResult =
      liveUrgentWarning &&
      (calculatorUrgent === undefined ||
        (isLiveHfLiquidatable && calculatorShowsBuffer))
        ? {
            ...calculatorResult,
            warnings: [
              liveUrgentWarning,
              ...calculatorResult.warnings.filter(
                (w) => w !== calculatorUrgent,
              ),
            ],
          }
        : calculatorResult;

    return {
      result: resultWithLiveHf,
      status: "ready",
      reorderVerificationContext: {
        CF: splitParams.CF,
        THF: splitParams.THF,
        LB: splitParams.LB,
        expectedHF: splitParams.expectedHF,
        minPeginBtc: calculatorParams.minPeginBtc,
        btcPrice,
        totalDebtUsd: debtValueUsd,
      },
      params: calculatorParams,
    };
  }, [
    splitParams,
    splitParamsError,
    pegInConfig,
    isLoading,
    connectedAddress,
    btcPrice,
    btcMetadata,
    collateralVaults,
    debtValueUsd,
    healthFactor,
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
