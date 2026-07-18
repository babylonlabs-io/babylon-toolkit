import type { LiquidationBand, LiquidationBandTone, PriceAxisTick } from "@babylonlabs-io/core-ui";

import type { CalculatorResult, LiquidationGroup } from "@/applications/aave/positionNotifications/types";
import { COPY } from "@/copy";
import { formatBtcAmount, formatPriceUsd, formatUsd } from "@/utils/formatting";

/**
 * Projects the liquidation cascade (`CalculatorResult.groups`) into the shapes
 * the core-ui charts + event cards consume. core-ui is a dumb renderer, so ALL
 * derivation and formatting happens here.
 *
 * Three values are derived (no new financial model — see issue #2043):
 *  - post-liquidation Health Factor: remaining collateral × price × CF ÷ debt.
 *    Uses the collateral factor, matching `calculate.ts`, NOT the SDK's
 *    liquidation-threshold HF.
 *  - fairness payment in wBTC: `fairnessPaymentUsd / btcPrice`.
 *  - Sacrificial vs Protected badge: no backing field exists. The first-seized
 *    group (index 0) is the sacrificial one; the rest are protected.
 *    // ponytail: index===0 heuristic — confirm the rule with design.
 */

const TONES: LiquidationBandTone[] = ["1", "2", "3"];

export interface LiquidationEventCard {
  key: string;
  title: string;
  badge: "sacrificial" | "protected";
  collateralLabel: string;
  liqPriceLabel: string;
  distanceLabel: string;
  distanceNegative: boolean;
  seizedVaults: { name: string; amountLabel: string }[];
  targetSeizureLabel: string;
  overSeizureLabel: string;
  collateralLiquidatedLabel: string;
  debtRepaidLabel: string;
  liquidatorProfitLabel: string;
  /** Full group shows a wBTC fairness payment; safe groups show fairness debt repaid. */
  fairness: { label: string; value: string };
  btcRemainingLabel: string;
  debtRemainingLabel: string;
  hfAfterLabel: string;
}

export interface LiquidationChartData {
  bands: LiquidationBand[];
  priceAxis: PriceAxisTick[];
  shareAxisLabels: string[];
  cards: LiquidationEventCard[];
}

export interface LiquidationChartOptions {
  /** Simulated (or live) BTC price driving which bands read as liquidated. */
  btcPrice: number;
  /** Collateral factor (0–1) from on-chain params, for post-liq HF. */
  collateralFactor: number;
}

const toneFor = (index: number): LiquidationBandTone => TONES[index % TONES.length];

function formatSignedPct(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

function hfAfter(group: LiquidationGroup, btcPrice: number, cf: number): string {
  if (group.debtRemainingAfter <= 0) return "∞";
  return ((group.btcRemainingAfter * btcPrice * cf) / group.debtRemainingAfter).toFixed(3);
}

function toCard(group: LiquidationGroup, btcPrice: number, cf: number): LiquidationEventCard {
  const sacrificial = group.index === 0;
  const fairness = group.isFullLiquidation
    ? {
        label: COPY.liquidations.events.fairnessPaymentWbtc,
        value: `${formatUsd(group.fairnessPaymentUsd)} (${formatBtcAmount(group.fairnessPaymentUsd / btcPrice)})`,
      }
    : { label: COPY.liquidations.events.fairnessDebtRepaid, value: formatUsd(group.fairnessDebtRepay) };

  return {
    key: String(group.index),
    title: COPY.liquidations.eventTitle(group.index + 1),
    badge: sacrificial ? "sacrificial" : "protected",
    collateralLabel: formatBtcAmount(group.combinedBtc),
    liqPriceLabel: formatPriceUsd(group.liquidationPrice),
    distanceLabel: formatSignedPct(group.distancePct),
    distanceNegative: group.distancePct < 0,
    seizedVaults: group.vaults.map((v) => ({ name: v.name, amountLabel: formatBtcAmount(v.btc) })),
    targetSeizureLabel: formatBtcAmount(group.targetSeizureBtc),
    overSeizureLabel: `+${formatBtcAmount(group.overSeizureBtc)}`,
    collateralLiquidatedLabel: formatBtcAmount(group.combinedBtc),
    debtRepaidLabel: formatUsd(group.debtRepaid),
    liquidatorProfitLabel: formatUsd(group.liquidatorProfitUsd),
    fairness,
    btcRemainingLabel: formatBtcAmount(group.btcRemainingAfter),
    debtRemainingLabel: formatUsd(group.debtRemainingAfter),
    hfAfterLabel: hfAfter(group, btcPrice, cf),
  };
}

export function buildLiquidationChartData(
  result: CalculatorResult,
  { btcPrice, collateralFactor }: LiquidationChartOptions,
): LiquidationChartData {
  const groups = result.groups;
  const totalBtc = groups.reduce((sum, g) => sum + g.combinedBtc, 0);

  let cumulativeBtc = 0;
  const bands: LiquidationBand[] = groups.map((group, i) => {
    const shareStart = totalBtc > 0 ? cumulativeBtc / totalBtc : 0;
    cumulativeBtc += group.combinedBtc;
    const shareEnd = totalBtc > 0 ? cumulativeBtc / totalBtc : 0;
    // Band spans from where this event triggers down to the next event's
    // trigger; the last band bottoms out at the axis floor (0 = fully wiped).
    const priceBottom = i < groups.length - 1 ? groups[i + 1].liquidationPrice : 0;
    const tone = toneFor(i);

    return {
      key: String(group.index),
      label: COPY.liquidations.eventTitle(group.index + 1),
      sublabel: COPY.liquidations.containVaults(
        group.vaults.map((v) => v.name.toLowerCase()).join(", "),
      ),
      amountLabel: formatBtcAmount(group.combinedBtc),
      priceTop: group.liquidationPrice,
      priceBottom,
      shareStart,
      shareEnd,
      state: btcPrice <= group.liquidationPrice ? "liquidated" : "live",
      tone,
      popoverMetrics: [
        {
          label: COPY.liquidations.popover.atPrice,
          value: formatPriceUsd(group.liquidationPrice),
          emphasis: true,
        },
        { label: COPY.liquidations.popover.distance, value: formatSignedPct(group.distancePct) },
        { label: COPY.liquidations.popover.vaults, value: group.vaults.map((v) => v.name).join(", ") },
        { label: COPY.liquidations.popover.seizes, value: formatBtcAmount(group.targetSeizureBtc) },
      ],
      cumulativeLabel: COPY.liquidations.cumulativeSeized(Math.round(shareEnd * 100)),
    };
  });

  // Segmented axis: current price, each trigger price, then the floor.
  const priceAxis: PriceAxisTick[] = [
    { value: btcPrice, label: formatPriceUsd(btcPrice) },
    ...groups.map((g) => ({ value: g.liquidationPrice, label: formatPriceUsd(g.liquidationPrice) })),
    { value: 0, label: formatPriceUsd(0) },
  ];

  const shareAxisLabels = [
    "0%",
    ...bands.slice(0, -1).map((b) => `${Math.round(b.shareEnd * 100)}%`),
    "100%",
  ];

  return {
    bands,
    priceAxis,
    shareAxisLabels,
    cards: groups.map((g) => toCard(g, btcPrice, collateralFactor)),
  };
}
