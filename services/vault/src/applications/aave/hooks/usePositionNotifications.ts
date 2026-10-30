import { HEALTH_FACTOR_LIQUIDATION_THRESHOLD } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { pegInConfigQueryOptions } from "@/context/ProtocolParamsContext";
import { COPY } from "@/copy";
import { useDashboardState } from "@/hooks/useDashboardState";
import { usePrices } from "@/hooks/usePrices";
import { satoshiToBtcNumber } from "@/utils/btcConversion";

import { POSITION_STALENESS_THRESHOLD_MS } from "../constants";
import { useAaveConfig } from "../context";
import {
  calculate,
  URGENT_HEALTH_FACTOR,
  type CalculatorParams,
  type CalculatorResult,
  type Vault,
  type Warning,
} from "../positionNotifications";
import type { ReorderVerificationContext } from "../services";
import { formatHealthFactor } from "../utils";

import { useAaveReservePrice } from "./useAaveReservePrice";
import { useVaultSplitParams } from "./useVaultSplitParams";

export type PositionNotificationsStatus =
  | "loading"
  | "no-wallet"
  | "no-vaults"
  | "incomplete-position"
  /**
   * No Chainlink BTC/USD round has been read yet, or the Spoke oracle returned
   * no positive BTC price.
   */
  | "no-price"
  /**
   * The Chainlink BTC/USD round is old or could not be read, or the Spoke
   * oracle's BTC price could not be read.
   */
  | "stale-price"
  /** The Spoke risk-parameter read failed; nothing can be calculated. */
  | "params-unavailable"
  | "ready";

export interface UsePositionNotificationsResult {
  /**
   * The cascade priced at the Spoke oracle's BTC price. Its urgent warning is
   * reconciled with the Spoke's live health factor: the live warning can be
   * added or take its place, and a fresh live health factor outside the urgent
   * band removes it.
   */
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
   * overridden `btcPrice` without touching this live path. `btcPrice` is the
   * Spoke oracle's vBTC price, the price the Spoke liquidates at.
   */
  params: CalculatorParams | null;
  /**
   * The Spoke oracle's BTC price whenever it is readable and the Chainlink
   * feed is fresh, with or without a position to price. Null while either is
   * loading, failing or stale. Equal to `params.btcPrice` when `params` is set.
   */
  btcPriceUsd: number | null;
}

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

/**
 * The one urgent warning to show, from the calculator's and the live health
 * factor's. A live reading may raise the urgency at any time, but lowers it
 * only when it is fresh: a failed or stale position read must not clear a
 * warning the calculator raised from a newer price.
 */
function chooseUrgentWarning({
  calculatorUrgent,
  liveUrgentWarning,
  isCalculatorLiquidatable,
  isLiveHfLiquidatable,
  isLiveHfFresh,
}: {
  calculatorUrgent: Warning | undefined;
  liveUrgentWarning: Warning | null;
  isCalculatorLiquidatable: boolean;
  isLiveHfLiquidatable: boolean;
  isLiveHfFresh: boolean;
}): Warning | undefined {
  // No live warning: the live health factor is outside the urgent band, or
  // there is none, which never counts as fresh.
  if (liveUrgentWarning === null)
    return isLiveHfFresh ? undefined : calculatorUrgent;
  if (calculatorUrgent === undefined) return liveUrgentWarning;
  // Both urgent, and they agree on whether the Spoke can liquidate now: the
  // calculator's warning names the liquidation price.
  if (isCalculatorLiquidatable === isLiveHfLiquidatable)
    return calculatorUrgent;
  // The calculator still shows a buffer the Spoke has already used up.
  if (isLiveHfLiquidatable) return liveUrgentWarning;
  // The calculator says liquidation can trigger now; the Spoke disagrees.
  return isLiveHfFresh ? liveUrgentWarning : calculatorUrgent;
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
    positionError,
    healthFactorReceivedAt,
    isLoading: dashboardLoading,
  } = useDashboardState(connectedAddress);

  // The cascade is priced at the Spoke oracle's BTC price, the price the Spoke
  // liquidates at, so its figures and the live health factor describe the
  // same position. The Spoke's oracle reports no round age, so the Chainlink
  // BTC/USD feed's health stands in for its freshness; its price is not used.
  const { config } = useAaveConfig();
  const {
    priceUsd: spokeBtcPriceUsd,
    isLoading: spokeBtcPriceLoading,
    isPriceStale: isSpokeBtcPricePlaceholder,
    error: spokeBtcPriceError,
    priceChangedAt: spokeBtcPriceChangedAt,
  } = useAaveReservePrice({
    spokeAddress: config?.coreSpokeAddress,
    reserveId: config?.vaultBtcReserveId,
  });
  const { metadata } = usePrices();
  const btcMetadata = metadata["BTC"];
  // The Spoke read keeps its error, in its query data, while it retries, so
  // this holds through retries rather than flickering back to loading.
  const isBtcPriceFailing =
    btcMetadata?.isStale === true ||
    btcMetadata?.fetchFailed === true ||
    spokeBtcPriceError !== null;
  const btcPriceUsd =
    !isBtcPriceFailing &&
    btcMetadata !== undefined &&
    !isSpokeBtcPricePlaceholder &&
    spokeBtcPriceUsd !== null &&
    spokeBtcPriceUsd > 0
      ? spokeBtcPriceUsd
      : null;

  // Suggested vault sizes must be depositable, so the calculator needs the
  // protocol's minimum peg-in. Same cached query the deposit form reads. It
  // only sizes suggestions: the warnings wait for the read to settle (so the
  // suggested amount does not change once the minimum arrives), and if it
  // failed they render with the suggestions not floored.
  const { data: pegInConfig, isLoading: pegInConfigLoading } = useQuery(
    pegInConfigQueryOptions(),
  );

  const isLoading =
    paramsLoading ||
    dashboardLoading ||
    pegInConfigLoading ||
    spokeBtcPriceLoading ||
    isSpokeBtcPricePlaceholder;
  // Uses the calculator's own urgent band, so the two warnings only disagree
  // when their inputs do.
  const liveUrgentWarning = useMemo(
    () =>
      connectedAddress &&
      !dashboardLoading &&
      debtValueUsd > 0 &&
      healthFactor !== null &&
      healthFactor < URGENT_HEALTH_FACTOR
        ? buildLiveHfUrgentWarning(healthFactor)
        : null,
    [connectedAddress, dashboardLoading, debtValueUsd, healthFactor],
  );
  // Fresh means the health factor's account data was received - not the debt
  // reads that complete the position query after it - within the staleness
  // threshold, and no earlier than the price the calculator used last
  // changed: a reading taken before the price moved describes a position that
  // no longer exists. Ages come from the receipt time itself, so a refetch in
  // flight (during which `isPositionDataStale` reads false) cannot make an old
  // reading count as new, and a poll returning the same price does not either.
  const isLiveHfFresh =
    healthFactor !== null &&
    !positionError &&
    healthFactorReceivedAt !== null &&
    Date.now() - healthFactorReceivedAt <= POSITION_STALENESS_THRESHOLD_MS &&
    healthFactorReceivedAt >= spokeBtcPriceChangedAt;

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
    // have nothing to receive. A failed Spoke price read, retries included, is
    // reported like a failed Chainlink read: `no-price` would hide the
    // warnings without saying why.
    if (isBtcPriceFailing)
      return {
        result: null,
        status: "stale-price",
        reorderVerificationContext: null,
        params: null,
      };
    if (btcPriceUsd === null)
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
      btcPrice: btcPriceUsd,
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

    // Both sides price BTC from the Spoke's oracle, but from separate reads
    // (the price every minute, the position every 30s), and the calculator
    // also uses indexed vault amounts and cached risk parameters, so the two
    // can still disagree. At most one urgent warning is shown; see
    // `chooseUrgentWarning`.
    const calculatorUrgent = calculatorResult.warnings.find(
      (w) => w.type === "urgent",
    );
    const firstGroup = calculatorResult.groups[0];
    const urgentWarning = chooseUrgentWarning({
      calculatorUrgent,
      liveUrgentWarning,
      // A nonnegative distance is the calculator's "liquidatable" case.
      isCalculatorLiquidatable:
        firstGroup !== undefined && firstGroup.distancePct >= 0,
      isLiveHfLiquidatable:
        healthFactor !== null &&
        healthFactor < HEALTH_FACTOR_LIQUIDATION_THRESHOLD,
      isLiveHfFresh,
    });
    // The live warning goes in as the returned `liveUrgentWarning` object
    // itself, never a copy: the top banner compares by reference.
    const otherWarnings = calculatorResult.warnings.filter(
      (w) => w !== calculatorUrgent,
    );
    const resultWithLiveHf: CalculatorResult =
      urgentWarning === calculatorUrgent
        ? calculatorResult
        : {
            ...calculatorResult,
            warnings: urgentWarning
              ? [urgentWarning, ...otherWarnings]
              : otherWarnings,
          };

    return {
      result: resultWithLiveHf,
      status: "ready",
      reorderVerificationContext: {
        CF: splitParams.CF,
        THF: splitParams.THF,
        LB: splitParams.LB,
        expectedHF: splitParams.expectedHF,
        minPeginBtc: calculatorParams.minPeginBtc,
        btcPrice: btcPriceUsd,
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
    isBtcPriceFailing,
    btcPriceUsd,
    collateralVaults,
    debtValueUsd,
    healthFactor,
    indexerError,
    liveUrgentWarning,
    isLiveHfFresh,
  ]);

  return {
    result,
    liveUrgentWarning,
    status,
    isLoading,
    reorderVerificationContext,
    params,
    btcPriceUsd,
  };
}
